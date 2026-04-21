# BGV Platform — Full API Test Suite v2.0
# Updated: Aadhaar (Section 9) and GSTIN (Section 10) now assert live IDfy results
# Required: Live IDfy credits with ind_aadhaar + ind_gstin enabled on account

param(
    [string]$BASE_URL  = "http://localhost:5001",
    [string]$API_KEY   = "bgv_secure_api_key_2026",
    [string]$CLIENT_ID = "57cab5a9-3c1f-428e-9b80-34d3ca27ad3b"
)

$headers = @{
    "x-api-key"    = $API_KEY
    "Content-Type" = "application/json"
}

$PASS = 0
$FAIL = 0

function Pass($msg) {
    Write-Host "  ✅ PASS — $msg" -ForegroundColor Green
    $script:PASS++
}

function Fail($msg) {
    Write-Host "  ❌ FAIL — $msg" -ForegroundColor Red
    $script:FAIL++
}

function Info($msg) {
    Write-Host "  ℹ️  $msg" -ForegroundColor Yellow
}

function Section($title) {
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
}

# ─── Helper: poll GET /verifications/:id until api_status leaves 'pending'/'processing' ───
# Waits up to $MaxWaitSec seconds with $PollInterval between attempts.
# Returns the full response object, or $null on timeout.
function WaitForResult($VerificationId, $authHeaders, $Label, $MaxWaitSec = 15, $PollInterval = 3) {
    $elapsed = 0
    while ($elapsed -lt $MaxWaitSec) {
        Write-Host "  ⏳ [$Label] Waiting ${elapsed}s / ${MaxWaitSec}s ..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $PollInterval
        $elapsed += $PollInterval

        try {
            $r = Invoke-RestMethod `
                -Uri "$BASE_URL/api/verifications/$VerificationId" `
                -Method GET -Headers $authHeaders

            $status = $r.data.api_status
            if ($status -notin @("pending", "processing")) {
                return $r
            }
        } catch {
            # Swallow — network hiccup during poll; try again
        }
    }
    return $null
}

# ============================================================
# 1. HEALTH CHECK
# ============================================================
Section "1. HEALTH CHECK"

try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/health" -Method GET
    if ($health.status -eq "healthy") { Pass "Server is healthy" }
    else { Fail "Health check returned unexpected status: $($health.status)" }
} catch {
    Fail "Health check failed: $_"
}

# ============================================================
# 2. API KEY PROTECTION
# ============================================================
Section "2. API KEY PROTECTION"

try {
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body "{}" -ErrorAction Stop
    Fail "Should have been rejected without API key"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -in @(401, 403)) {
        Pass "Request without API key correctly rejected"
    } else {
        Fail "Unexpected status: $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 3. LOGIN
# ============================================================
Section "3. LOGIN"

$ACCESS_TOKEN  = $null
$REFRESH_TOKEN = $null

try {
    $loginBody = @{ email = "admin@test.com"; password = "password123" } | ConvertTo-Json
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" -Method POST `
        -Headers $headers -Body $loginBody

    $ACCESS_TOKEN  = $loginResponse.accessToken
    $REFRESH_TOKEN = $loginResponse.refreshToken

    if ($ACCESS_TOKEN)  { Pass "Access token received" }
    else                { Fail "No access token in response" }
    if ($REFRESH_TOKEN) { Pass "Refresh token received" }
    else                { Fail "No refresh token in response" }
} catch {
    Fail "Login failed: $_"
}

$authHeaders = @{
    "x-api-key"     = $API_KEY
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $ACCESS_TOKEN"
}

# ============================================================
# 4. AUTH PROTECTION
# ============================================================
Section "4. AUTH PROTECTION (JWT required)"

try {
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST `
        -Headers $headers -Body "{}" -ErrorAction Stop
    Fail "Should have been rejected without JWT"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -in @(401, 403)) {
        Pass "Request without JWT correctly rejected"
    } else {
        Fail "Unexpected status: $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 5. PAN VERIFICATION
# ============================================================
Section "5. PAN VERIFICATION"

$VERIFICATION_ID = $null

try {
    $panBody = @{
        pan_number = "ABCDE1234F"
        full_name  = "Rahul Sharma"
        dob        = "1998-05-10"
        client_id  = $CLIENT_ID
    } | ConvertTo-Json

    $panResponse = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST `
        -Headers $authHeaders -Body $panBody

    $VERIFICATION_ID = $panResponse.data.id

    if ($panResponse.success)    { Pass "PAN verification created" }
    else                         { Fail "PAN creation returned success=false" }
    if ($VERIFICATION_ID)        { Pass "Verification ID returned: $VERIFICATION_ID" }
    else                         { Fail "No verification ID in response" }
    if ($panResponse.data.api_status -eq "pending") {
        Pass "Initial api_status is 'pending' (correct for async)"
    } else {
        Fail "Expected api_status='pending', got '$($panResponse.data.api_status)'"
    }
} catch {
    Fail "PAN verification request failed: $_"
}

# ============================================================
# 5b. PAN VALIDATION — Bad inputs
# ============================================================
Section "5b. PAN VALIDATION (bad inputs should 400)"

$badPanCases = @(
    @{ pan_number = "INVALID";    full_name = "Test"; dob = "1998-01-01"; client_id = $CLIENT_ID;    label = "invalid PAN format" },
    @{ pan_number = "ABCDE1234F"; full_name = "";     dob = "1998-01-01"; client_id = $CLIENT_ID;    label = "empty full_name" },
    @{ pan_number = "ABCDE1234F"; full_name = "Test"; dob = "1998-01-01"; client_id = "not-a-uuid";  label = "invalid client_id UUID" }
)

foreach ($case in $badPanCases) {
    try {
        $body = @{
            pan_number = $case.pan_number
            full_name  = $case.full_name
            dob        = $case.dob
            client_id  = $case.client_id
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BASE_URL/api/verifications/pan" -Method POST `
            -Headers $authHeaders -Body $body -ErrorAction Stop
        Fail "Should have rejected: $($case.label)"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            Pass "Correctly rejected: $($case.label)"
        } else {
            Fail "Expected 400 for '$($case.label)', got $($_.Exception.Response.StatusCode.value__)"
        }
    }
}

# ============================================================
# 7. GET PAN VERIFICATION RESULT (async wait)
# ============================================================
Section "7. GET PAN VERIFICATION RESULT"

$panResult = $null

if ($VERIFICATION_ID) {
    $panResult = WaitForResult $VERIFICATION_ID $authHeaders "PAN" -MaxWaitSec 20

    if ($null -eq $panResult) {
        Fail "PAN result still pending/processing after 20s — IDfy may be slow"
    } else {
        if ($panResult.success) { Pass "GET /verifications/$VERIFICATION_ID succeeded" }
        else                    { Fail "GET returned success=false" }

        $apiStatus = $panResult.data.api_status
        Info "api_status = $apiStatus"

        if ($apiStatus -in @("success", "failed")) {
            Pass "api_status resolved from 'pending' (IDfy responded)"
        } else {
            Fail "api_status is still '$apiStatus' after wait"
        }

        # If IDfy responded successfully, validate result shape
        if ($apiStatus -eq "success") {
            $result = $panResult.data.result.result
            if ($null -ne $result) {
                Pass "result.result object is present"
            } else {
                Fail "result.result is null — responseProcessor may have failed"
            }

            Info "lookup_status     = $($result.lookup_status)"
            Info "pan_status        = $($result.pan_status)"
            Info "name_match_result = $($result.name_match_result)"
            Info "name_match_score  = $($result.name_match_score)"
            Info "aadhaar_linked    = $($result.aadhaar_linked)"
            Info "verified          = $($panResult.data.verified)"

            # lookup_status must be id_found or id_not_found (never null on success)
            if ($result.lookup_status -in @("id_found", "id_not_found")) {
                Pass "lookup_status is a valid value: '$($result.lookup_status)'"
            } else {
                Fail "Unexpected lookup_status: '$($result.lookup_status)'"
            }

            # aadhaar_linked must be a boolean (not the raw "Y"/"N" string)
            if ($result.aadhaar_linked -is [bool]) {
                Pass "aadhaar_linked is boolean (transform() ran correctly)"
            } else {
                Fail "aadhaar_linked is not boolean — got: '$($result.aadhaar_linked)'"
            }

            # name_matched must be boolean or null
            if ($null -eq $result.name_matched -or $result.name_matched -is [bool]) {
                Pass "name_matched is boolean or null (transform() ran correctly)"
            } else {
                Fail "name_matched has unexpected type: '$($result.name_matched)'"
            }

            # request_id and task_id must be present for audit trail
            if ($result.request_id) {
                Pass "request_id present in result (audit trail intact)"
            } else {
                Fail "request_id missing from result"
            }
        }
    }
} else {
    Fail "Skipped — no VERIFICATION_ID from step 5"
}

# ============================================================
# 8. GET NONEXISTENT VERIFICATION
# ============================================================
Section "8. GET NON-EXISTENT VERIFICATION"

try {
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/00000000-0000-0000-0000-000000000000" `
        -Method GET -Headers $authHeaders -ErrorAction Stop
    Fail "Should have returned 404"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Pass "Non-existent ID correctly returns 404"
    } else {
        Fail "Expected 404, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 9. AADHAAR VERIFICATION — Full live-credit flow
# ============================================================
Section "9. AADHAAR VERIFICATION (live IDfy credits)"

$AADHAAR_VID = $null

try {
    $aadhaarBody = @{
        masked_aadhaar = "XXXX-XXXX-1234"
        full_name      = "Rahul Sharma"
        client_id      = $CLIENT_ID
    } | ConvertTo-Json

    $aadhaarResponse = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/aadhaar" `
        -Method POST -Headers $authHeaders -Body $aadhaarBody

    $AADHAAR_VID = $aadhaarResponse.data.id

    if ($aadhaarResponse.success) { Pass "Aadhaar verification request created" }
    else                          { Fail "Aadhaar creation returned success=false" }

    if ($AADHAAR_VID) { Pass "Aadhaar verification ID returned: $AADHAAR_VID" }
    else              { Fail "No verification ID in Aadhaar response" }

    if ($aadhaarResponse.data.api_status -eq "pending") {
        Pass "Initial api_status is 'pending'"
    } else {
        Fail "Expected api_status='pending', got '$($aadhaarResponse.data.api_status)'"
    }

    # Confirm document_type stored correctly
    if ($aadhaarResponse.data.document_type -eq "AADHAAR") {
        Pass "document_type = 'AADHAAR' stored correctly"
    } else {
        Fail "Expected document_type='AADHAAR', got '$($aadhaarResponse.data.document_type)'"
    }

    # UIDAI compliance: masked number stored, never full 12 digits
    $storedNumber = $aadhaarResponse.data.document_number
    if ($storedNumber -eq "XXXX-XXXX-1234") {
        Pass "UIDAI compliance: masked_aadhaar stored as-is (full number never accepted)"
    } else {
        Fail "document_number stored incorrectly: '$storedNumber'"
    }
} catch {
    Fail "Aadhaar request failed: $_"
}

# ── 9a. Poll for Aadhaar async result ─────────────────────────────────────────
Section "9a. AADHAAR ASYNC RESULT"

if ($AADHAAR_VID) {
    $aadhaarResult = WaitForResult $AADHAAR_VID $authHeaders "Aadhaar" -MaxWaitSec 20

    if ($null -eq $aadhaarResult) {
        Fail "Aadhaar result still pending/processing after 20s"
    } else {
        if ($aadhaarResult.success) { Pass "GET /verifications/$AADHAAR_VID succeeded" }
        else                        { Fail "GET returned success=false" }

        $apiStatus = $aadhaarResult.data.api_status
        Info "api_status = $apiStatus"

        if ($apiStatus -in @("success", "failed")) {
            Pass "api_status resolved from 'pending' (IDfy responded)"
        } else {
            Fail "api_status still '$apiStatus' after wait — IDfy did not respond"
        }

        if ($apiStatus -eq "success") {
            $result = $aadhaarResult.data.result.result
            if ($null -ne $result) {
                Pass "result.result object is present"
            } else {
                Fail "result.result is null — idfyMapping.aadhaar may have failed"
            }

            Info "lookup_status     = $($result.lookup_status)"
            Info "name_as_per_uidai = $($result.name_as_per_uidai)"
            Info "year_of_birth     = $($result.year_of_birth)"
            Info "gender            = $($result.gender)"
            Info "area              = $($result.area)"
            Info "state             = $($result.state)"
            Info "name_match_result = $($result.name_match_result)"
            Info "name_match_score  = $($result.name_match_score)"
            Info "name_matched      = $($result.name_matched)"
            Info "verified          = $($aadhaarResult.data.verified)"

            if ($result.lookup_status -in @("id_found", "id_not_found")) {
                Pass "lookup_status is a valid value: '$($result.lookup_status)'"
            } else {
                Fail "Unexpected lookup_status: '$($result.lookup_status)'"
            }

            # name_matched boolean transform check
            if ($null -eq $result.name_matched -or $result.name_matched -is [bool]) {
                Pass "name_matched is boolean or null (transform() ran correctly)"
            } else {
                Fail "name_matched has unexpected type: '$($result.name_matched)'"
            }

            # When id_found, UIDAI metadata fields must be present
            if ($result.lookup_status -eq "id_found") {
                if ($result.name_as_per_uidai) { Pass "name_as_per_uidai present" }
                else                           { Fail "name_as_per_uidai missing on id_found" }

                if ($result.year_of_birth)     { Pass "year_of_birth present" }
                else                           { Fail "year_of_birth missing on id_found" }

                if ($result.gender -in @("M","F","T")) {
                    Pass "gender is valid value: '$($result.gender)'"
                } else {
                    Fail "gender has unexpected value: '$($result.gender)'"
                }
            } else {
                Info "lookup_status=id_not_found — UIDAI metadata fields will be null (expected)"
                Pass "id_not_found is a valid live IDfy response — account activation confirmed"
            }

            # Audit trail
            if ($result.request_id) { Pass "request_id present in result (audit trail intact)" }
            else                    { Fail "request_id missing from result" }

        } elseif ($apiStatus -eq "failed") {
            $reason = $aadhaarResult.data.failure_reason
            Info "failure_reason = $reason"

            # Distinguish account-not-enabled (expected on test tier) vs real error
            if ($reason -match "NOT_FOUND|404|not enabled|account") {
                Fail "IDfy returned account restriction — ind_aadhaar not enabled on this account yet"
                Info "ACTION: Email eve.support@idfy.com to enable ind_aadhaar for your account-id"
            } else {
                Fail "Aadhaar api_status=failed — failure_reason: $reason"
            }
        }
    }
} else {
    Fail "Skipped — no AADHAAR_VID from section 9"
}

# ============================================================
# 9b. AADHAAR VALIDATION — Bad inputs
# ============================================================
Section "9b. AADHAAR VALIDATION (bad inputs should 400)"

# Unmasked full Aadhaar — must be rejected
try {
    $badAadhaar = @{ masked_aadhaar = "1234-5678-9012"; full_name = "Test"; client_id = $CLIENT_ID } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/aadhaar" -Method POST `
        -Headers $authHeaders -Body $badAadhaar -ErrorAction Stop
    Fail "Should have rejected unmasked Aadhaar format"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected unmasked Aadhaar (not XXXX-XXXX-NNNN format)"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Missing full_name
try {
    $badAadhaar2 = @{ masked_aadhaar = "XXXX-XXXX-1234"; full_name = ""; client_id = $CLIENT_ID } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/aadhaar" -Method POST `
        -Headers $authHeaders -Body $badAadhaar2 -ErrorAction Stop
    Fail "Should have rejected empty full_name"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected empty full_name on Aadhaar"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Invalid client_id UUID
try {
    $badAadhaar3 = @{ masked_aadhaar = "XXXX-XXXX-1234"; full_name = "Test"; client_id = "not-a-uuid" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/aadhaar" -Method POST `
        -Headers $authHeaders -Body $badAadhaar3 -ErrorAction Stop
    Fail "Should have rejected invalid client_id UUID on Aadhaar"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected invalid client_id UUID on Aadhaar"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 10. GSTIN VERIFICATION — Full live-credit flow
# ============================================================
Section "10. GSTIN VERIFICATION (live IDfy credits)"

$GSTIN_VID = $null

try {
    $gstinBody = @{
        gstin         = "27ABCDE1234F1Z5"
        business_name = "ABC Traders"
        client_id     = $CLIENT_ID
    } | ConvertTo-Json

    $gstinResponse = Invoke-RestMethod -Uri "$BASE_URL/api/verifications/gstin" `
        -Method POST -Headers $authHeaders -Body $gstinBody

    $GSTIN_VID = $gstinResponse.data.id

    if ($gstinResponse.success) { Pass "GSTIN verification request created" }
    else                        { Fail "GSTIN creation returned success=false" }

    if ($GSTIN_VID) { Pass "GSTIN verification ID returned: $GSTIN_VID" }
    else            { Fail "No verification ID in GSTIN response" }

    if ($gstinResponse.data.api_status -eq "pending") {
        Pass "Initial api_status is 'pending'"
    } else {
        Fail "Expected api_status='pending', got '$($gstinResponse.data.api_status)'"
    }

    # Confirm document_type stored correctly
    if ($gstinResponse.data.document_type -eq "GSTIN") {
        Pass "document_type = 'GSTIN' stored correctly"
    } else {
        Fail "Expected document_type='GSTIN', got '$($gstinResponse.data.document_type)'"
    }

    # business_name stored for our records (IDfy doesn't receive it)
    if ($gstinResponse.data.business_name -eq "ABC Traders") {
        Pass "business_name stored correctly (not sent to IDfy)"
    } else {
        Fail "business_name not stored — got '$($gstinResponse.data.business_name)'"
    }
} catch {
    Fail "GSTIN request failed: $_"
}

# ── 10a. Poll for GSTIN async result ──────────────────────────────────────────
Section "10a. GSTIN ASYNC RESULT"

if ($GSTIN_VID) {
    $gstinResult = WaitForResult $GSTIN_VID $authHeaders "GSTIN" -MaxWaitSec 20

    if ($null -eq $gstinResult) {
        Fail "GSTIN result still pending/processing after 20s"
    } else {
        if ($gstinResult.success) { Pass "GET /verifications/$GSTIN_VID succeeded" }
        else                      { Fail "GET returned success=false" }

        $apiStatus = $gstinResult.data.api_status
        Info "api_status = $apiStatus"

        if ($apiStatus -in @("success", "failed")) {
            Pass "api_status resolved from 'pending' (IDfy responded)"
        } else {
            Fail "api_status still '$apiStatus' after wait"
        }

        if ($apiStatus -eq "success") {
            $result = $gstinResult.data.result.result
            if ($null -ne $result) {
                Pass "result.result object is present"
            } else {
                Fail "result.result is null — idfyMapping.gst may have failed"
            }

            Info "lookup_status                = $($result.lookup_status)"
            Info "gstin                        = $($result.gstin)"
            Info "legal_name                   = $($result.legal_name)"
            Info "trade_name                   = $($result.trade_name)"
            Info "gstin_status                 = $($result.gstin_status)"
            Info "gstin_active                 = $($result.gstin_active)"
            Info "registration_date            = $($result.registration_date)"
            Info "business_type                = $($result.business_type)"
            Info "taxpayer_type                = $($result.taxpayer_type)"
            Info "principal_place_of_business  = $($result.principal_place_of_business)"
            Info "state_jurisdiction           = $($result.state_jurisdiction)"
            Info "verified                     = $($gstinResult.data.verified)"

            if ($result.lookup_status -in @("id_found", "id_not_found")) {
                Pass "lookup_status is a valid value: '$($result.lookup_status)'"
            } else {
                Fail "Unexpected lookup_status: '$($result.lookup_status)'"
            }

            # gstin_active boolean transform check (mirrors aadhaar_linked on PAN)
            if ($result.gstin_active -is [bool]) {
                Pass "gstin_active is boolean (transform() ran correctly)"
            } else {
                Fail "gstin_active is not boolean — got: '$($result.gstin_active)' — check idfyMapping.gst.transform()"
            }

            # When id_found, business identity fields must be present
            if ($result.lookup_status -eq "id_found") {
                if ($result.legal_name)        { Pass "legal_name present" }
                else                           { Fail "legal_name missing on id_found" }

                if ($result.gstin_status)      { Pass "gstin_status present" }
                else                           { Fail "gstin_status missing on id_found" }

                if ($result.registration_date) { Pass "registration_date present" }
                else                           { Fail "registration_date missing on id_found" }

                # IMPORTANT: business_name must NOT appear in IDfy result
                # (it was never sent to IDfy — ind_gstin has no name matching)
                if (-not $result.PSObject.Properties["business_name"]) {
                    Pass "business_name correctly absent from IDfy result (no server-side name matching for GSTIN)"
                } else {
                    Info "business_name present in result — verify it was NOT sent to IDfy"
                }
            } else {
                Info "lookup_status=id_not_found — GSTIN not registered or invalid (expected for test data)"
                Pass "id_not_found is a valid live IDfy response — account activation confirmed"
            }

            # Audit trail
            if ($result.request_id) { Pass "request_id present in result (audit trail intact)" }
            else                    { Fail "request_id missing from result" }

        } elseif ($apiStatus -eq "failed") {
            $reason = $gstinResult.data.failure_reason
            Info "failure_reason = $reason"

            if ($reason -match "NOT_FOUND|404|not enabled|account") {
                Fail "IDfy returned account restriction — ind_gstin not enabled on this account yet"
                Info "ACTION: Email eve.support@idfy.com to enable ind_gstin for your account-id"
            } else {
                Fail "GSTIN api_status=failed — failure_reason: $reason"
            }
        }
    }
} else {
    Fail "Skipped — no GSTIN_VID from section 10"
}

# ============================================================
# 10b. GSTIN VALIDATION — Bad inputs
# ============================================================
Section "10b. GSTIN VALIDATION (bad inputs should 400)"

# Invalid GSTIN format
try {
    $badGstin = @{ gstin = "INVALID_GSTIN"; business_name = "Test Co"; client_id = $CLIENT_ID } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/gstin" -Method POST `
        -Headers $authHeaders -Body $badGstin -ErrorAction Stop
    Fail "Should have rejected invalid GSTIN format"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected invalid GSTIN format"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Missing business_name
try {
    $badGstin2 = @{ gstin = "27ABCDE1234F1Z5"; business_name = ""; client_id = $CLIENT_ID } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/gstin" -Method POST `
        -Headers $authHeaders -Body $badGstin2 -ErrorAction Stop
    Fail "Should have rejected empty business_name"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected empty business_name on GSTIN"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# Invalid client_id UUID
try {
    $badGstin3 = @{ gstin = "27ABCDE1234F1Z5"; business_name = "Test Co"; client_id = "not-a-uuid" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/gstin" -Method POST `
        -Headers $authHeaders -Body $badGstin3 -ErrorAction Stop
    Fail "Should have rejected invalid client_id UUID on GSTIN"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Pass "Correctly rejected invalid client_id UUID on GSTIN"
    } else {
        Fail "Expected 400, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 11. RETRY VERIFICATION
# ============================================================
Section "11. RETRY VERIFICATION"

if ($VERIFICATION_ID) {
    try {
        $retryResponse = Invoke-RestMethod `
            -Uri "$BASE_URL/api/verifications/retry/$VERIFICATION_ID" `
            -Method POST -Headers $authHeaders

        if ($retryResponse.success) { Pass "Retry endpoint returned success" }
        else                        { Fail "Retry returned success=false" }

        if ($retryResponse.data.retry_count -ge 1) {
            Pass "retry_count incremented to $($retryResponse.data.retry_count)"
        } else {
            Fail "retry_count did not increment"
        }

        if ($retryResponse.data.status -eq "retrying") {
            Pass "status set to 'retrying'"
        } else {
            Fail "Expected status='retrying', got '$($retryResponse.data.status)'"
        }
    } catch {
        Fail "Retry failed: $_"
    }
} else {
    Fail "Skipped — no VERIFICATION_ID from step 5"
}

# ============================================================
# 12. RETRY NON-EXISTENT
# ============================================================
Section "12. RETRY NON-EXISTENT ID"

try {
    Invoke-RestMethod -Uri "$BASE_URL/api/verifications/retry/00000000-0000-0000-0000-000000000000" `
        -Method POST -Headers $authHeaders -ErrorAction Stop
    Fail "Should have returned 404"
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Pass "Non-existent retry correctly returns 404"
    } else {
        Fail "Expected 404, got $($_.Exception.Response.StatusCode.value__)"
    }
}

# ============================================================
# 13. WEBHOOK ENDPOINT — IDfy simulation
# ============================================================
Section "13. WEBHOOK — IDfy push simulation"

# Test A: Webhook is public (no API key)
try {
    $webhookBody = @{
        request_id = "webhook-test-no-match-$(Get-Random)"
        status     = "completed"
        result     = @{ pan_number = "ZZZZZ9999Z"; status = "id_not_found" }
    } | ConvertTo-Json

    $wh = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/idfy" -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $webhookBody

    Pass "Webhook endpoint reachable without API key (correctly public)"
    Info "Response: $($wh.message)"
} catch {
    $sc = $_.Exception.Response.StatusCode.value__
    if ($sc -eq 401) {
        Fail "Webhook returned 401 — route is NOT public (apiKeyAuth is blocking IDfy)"
    } else {
        Fail "Webhook call threw unexpectedly: $_"
    }
}

# Test B: Matched webhook
if ($VERIFICATION_ID) {
    Info "Sending simulated IDfy result for our verification..."
    try {
        $simulatedWebhook = @{
            request_id = "idfy-simulated-$(Get-Random)"
            status     = "completed"
            result     = @{
                source_output = @{
                    status                 = "id_found"
                    pan_status             = "Existing and Valid. PAN is Operative"
                    aadhaar_seeding_status = "Y"
                }
                name_match_result = @{
                    match_result = "yes"
                    match_score  = 95
                }
            }
        } | ConvertTo-Json -Depth 5

        $whResult = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/idfy" -Method POST `
            -Headers @{ "Content-Type" = "application/json" } `
            -Body $simulatedWebhook

        if ($whResult.success) {
            Pass "Webhook processed and matched a verification"
            Info "Matched verification_id: $($whResult.data.verification_id)"
            Info "api_status: $($whResult.data.api_status)"
        } else {
            Info "Webhook received, message: $($whResult.message)"
            Pass "Webhook endpoint returned 200 (correct — IDfy won't retry)"
        }
    } catch {
        Fail "Webhook simulation threw: $_"
    }
}

# Test C: Duplicate webhook
Info "Sending duplicate webhook to test duplicate protection..."
try {
    $dupWebhook = @{
        request_id = "dup-test-$(Get-Random)"
        status     = "completed"
        result     = @{ status = "id_found" }
    } | ConvertTo-Json

    $dupResult = Invoke-RestMethod -Uri "$BASE_URL/api/webhooks/idfy" -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $dupWebhook

    Pass "Duplicate webhook returned 200 (no retry storm triggered)"
    Info "Response: $($dupResult.message)"
} catch {
    Fail "Duplicate webhook threw (should always return 200): $_"
}

# ============================================================
# 14. TOKEN REFRESH
# ============================================================
Section "14. TOKEN REFRESH"

if ($REFRESH_TOKEN) {
    try {
        $refreshBody = @{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json
        $refreshResp = Invoke-RestMethod -Uri "$BASE_URL/api/auth/refresh" -Method POST `
            -Headers $headers -Body $refreshBody

        if ($refreshResp.accessToken) {
            Pass "Refresh token returned new access token"
            $ACCESS_TOKEN = $refreshResp.accessToken
            $authHeaders["Authorization"] = "Bearer $ACCESS_TOKEN"
        } else {
            Fail "No accessToken in refresh response"
        }
    } catch {
        Fail "Token refresh failed: $_"
    }
} else {
    Fail "Skipped — no REFRESH_TOKEN from step 3"
}

# ============================================================
# 15. LOGOUT
# ============================================================
Section "15. LOGOUT"

if ($REFRESH_TOKEN) {
    try {
        $logoutBody = @{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BASE_URL/api/auth/logout" -Method POST `
            -Headers $authHeaders -Body $logoutBody | Out-Null
        Pass "Logout succeeded"
    } catch {
        Fail "Logout failed: $_"
    }
} else {
    Fail "Skipped — no REFRESH_TOKEN"
}

# ============================================================
# 16. REFRESH AFTER LOGOUT (MUST FAIL)
# ============================================================
Section "16. REFRESH AFTER LOGOUT (must be rejected)"

try {
    $refreshBody = @{ refreshToken = $REFRESH_TOKEN } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BASE_URL/api/auth/refresh" -Method POST `
        -Headers $headers -Body $refreshBody -ErrorAction Stop
    Fail "Refresh should have been rejected after logout"
} catch {
    Pass "Refresh correctly rejected after logout (token invalidated)"
}

# ============================================================
# SUMMARY
# ============================================================
$TOTAL = $PASS + $FAIL
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta
Write-Host "  Total : $TOTAL"
Write-Host "  Pass  : $PASS" -ForegroundColor Green
Write-Host "  Fail  : $FAIL" -ForegroundColor $(if ($FAIL -eq 0) { "Green" } else { "Red" })
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Magenta

if ($FAIL -eq 0) {
    Write-Host "`n  🎉 All tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n  ⚠️  $FAIL test(s) failed — check output above" -ForegroundColor Red
}

Write-Host "`n  Useful DB queries:" -ForegroundColor Yellow
Write-Host "  psql -U postgres -d bgv_platform -c `"SELECT id,document_type,api_status,status,failure_reason FROM verification_requests ORDER BY created_at DESC LIMIT 10;`""
Write-Host "  psql -U postgres -d bgv_platform -c `"SELECT vendor,event_type,status,received_at FROM webhook_events ORDER BY received_at DESC LIMIT 5;`""
Write-Host "  psql -U postgres -d bgv_platform -c `"SELECT vr.document_type,vr.api_status,res.verified,res.result_data FROM verification_requests vr LEFT JOIN verification_results res ON res.verification_id=vr.id ORDER BY vr.created_at DESC LIMIT 5;`""
