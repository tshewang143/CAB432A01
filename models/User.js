function findByCredentials(username, password) {
  console.log('findByCredentials called with username:', username);
  // Mock user database
  const users = [
    { id: 1, username: 'user1', password: 'pass1', role: 'user' },
    { id: 2, username: 'client1', password: 'password', role: 'user'}
  ];
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    console.log('User found:', user.username);
  } else {
    console.log('No user found for username:', username);
  }
  return user;
}

module.exports = { findByCredentials };
