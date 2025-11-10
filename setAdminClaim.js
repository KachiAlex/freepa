const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json'); // point to your key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const email = 'onyedika.akoma@gmail.com';

async function setClaim() {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { platformAdmin: true });
  console.log(`platformAdmin claim set for ${user.email} (${user.uid})`);
}

setClaim()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });