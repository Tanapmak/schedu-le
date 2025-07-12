import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';

import sessionRouter from './routes/session.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
    res.send("backend is up!")
});

app.use("/api/sessions", sessionRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
})