const bcrypt = require('bcrypt');

bcrypt.compare(
  'password123',
  '$2b$10$6qtLU8vzeASJRgNSThefkeXZT/UAnDr8eNSk796F/llpe2bEw.xnK'
).then(result => {
  console.log("MATCH RESULT:", result);
});