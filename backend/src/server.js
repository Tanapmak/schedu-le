import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';

import sessionRouter from './routes/session.js';
import personnelRouter from './routes/personnel.js';
import dayoffRouter from './routes/dayoff.js';
import roomRouter from './routes/room.js';
import summaryRouter from './routes/summary.js';

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.send("backend is up!")
});

app.use("/api/sessions", sessionRouter);
app.use("/api/personnels", personnelRouter);
app.use("/api/dayoffs", dayoffRouter);
app.use("/api/rooms", roomRouter);
app.use("/api/summary", summaryRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`server is running on http://localhost:${PORT}`);
})