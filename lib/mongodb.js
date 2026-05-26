import { MongoClient } from 'mongodb';
require("node:dns/promises").setServers(["1.1.1.1", "8.8.8.8"]); //because dns issue where it will resolve uri wrong or something


const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/budget-app';
const options = {};

let client;
let clientPromise;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;

export async function getDb() {
  //const client = await clientPromise; return client.db();

  console.log("Attempting Mongo connection...");
  try {
    const client = await clientPromise;
    const db = client.db();
    const ping = await db.command({ ping: 1 });
    console.log("MongoDB ping result:", ping);
    return db;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err; // keep throwing so API still returns 500
  }

}
