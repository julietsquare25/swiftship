// Firebase configuration and initialization
const firebaseConfig = {
  apiKey: "AIzaSyAr-aFO9xK7oVAgg3Kny0bUHRoTwC1bHLw",
  authDomain: "doordashconsole.firebaseapp.com",
  databaseURL: "https://doordashconsole-default-rtdb.firebaseio.com",
  projectId: "doordashconsole",
  storageBucket: "doordashconsole.firebasestorage.app",
  messagingSenderId: "843944254913",
  appId: "1:843944254913:web:88198ddc9b45e850972340",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
