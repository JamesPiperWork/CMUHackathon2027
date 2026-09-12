// Seed the demo league by POSTing to the running app. Usage: npm run seed
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const res = await fetch(`${base}/api/seed`, { method: "POST" });
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
if (!json.ok) process.exit(1);
