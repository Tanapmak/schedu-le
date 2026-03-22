import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT,
});

console.log("Checking DB Config:");
console.log("User:", process.env.PGUSER);
console.log("Password Type:", typeof process.env.PGPASSWORD);

export default pool;