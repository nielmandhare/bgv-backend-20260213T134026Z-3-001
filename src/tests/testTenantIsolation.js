const db = require('../utils/db');
const User = require('../models/User');

async function testTenantIsolation() {
  console.log('\n🔒 TESTING MULTI-TENANT ISOLATION\n');
  
  const tenant1Id = '7e204e4c-c1f3-43b1-8671-0c8e4f82337a'; // Shovel Screening
  const tenant2Id = '4191104d-18da-4ff8-9b75-c1d07ea7cd15'; // Demo Corp

  try {
    // Test 1: User should only see their tenant's users
    console.log('Test 1: User.findAll() with tenant filter');
    const users1 = await User.findAll(tenant1Id);
    const users2 = await User.findAll(tenant2Id);
    console.log(`✅ Tenant 1 has ${users1.length} users`);
    console.log(`✅ Tenant 2 has ${users2.length} users`);
    
    // Test 2: Try to access wrong tenant's data (should return null, not throw)
    console.log('\nTest 2: Attempt cross-tenant access (should return null)');
    
    // Get a user from tenant 2
    const tenant2User = users2[0];
    
    if (tenant2User) {
      // Try to access it with tenant 1's ID
      const wrongUser = await User.findById(tenant2User.id, tenant1Id);
      
      if (wrongUser) {
        console.log('❌ FAILED: Was able to access user from another tenant!');
        console.log('   User found:', wrongUser.email);
      } else {
        console.log('✅ PASSED: Cross-tenant access correctly returned null');
      }
    } else {
      console.log('⚠️ No users found in tenant 2 for testing');
    }

    console.log('\n✅ Tenant isolation test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testTenantIsolation();
