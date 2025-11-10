const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json'); // same key you used earlier

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = 'onyedika.akoma@gmail.com';

admin
  .auth()
  .getUserByEmail(email)
  .then((user) => {
    console.log('UID:', user.uid);
    console.log('Custom claims:', JSON.stringify(user.customClaims, null, 2));
  })
  .catch(console.error);