import pool from "../config/db.js";

// GET /api/personnels
export async function getAllPersonnel(req, res) {
    try {
        const result = await pool.query(
            `SELECT
                psn.id AS personnel_id,
                psn.f_name,
                psn.l_name,
                psn.nickname,
                psn.color,
                psn.employment_type,
                psn.status,
                psn.kpi_hours,
                psn.max_hours,
                psn.created_at,
                psn.updated_at,
                pos.id AS position_id,
                pos.position AS position_name
            FROM personnels psn
            LEFT JOIN positions pos
                ON psn.position_id = pos.id
            ORDER BY psn.id ASC`);

        const personnels = result.rows;
        res.json(personnels);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, cannot get personnels" });
    }
}

// GET /api/personnels/mc
export async function getAllMC(req, res) {
    try {
        const result = await pool.query(
            `SELECT
                psn.id AS personnel_id,
                psn.nickname,
                pos.position AS role_name,
                psn.color,
                psn.employment_type,
                psn.kpi_hours,
                psn.max_hours
            FROM personnels psn
            LEFT JOIN positions pos
                ON psn.position_id = pos.id
            WHERE pos.id = 1`);
        const mcList = result.rows;
        res.status(200).json(mcList)
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot get MC List"});
    }
}

// GET /api/personnels/pd
export async function getAllPD(req, res) {
    try {
        const result = await pool.query(
            `SELECT
                psn.id AS personnel_id,
                psn.nickname,
                pos.position AS role_name,
                psn.color,
                psn.employment_type,
                psn.kpi_hours,
                psn.max_hours
            FROM personnels psn
            LEFT JOIN positions pos
                ON psn.position_id = pos.id
            WHERE pos.id = 2`);
        const pdList = result.rows;
        res.status(200).json(pdList)
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot get PD List"});
    }
}

// GET /api/personnels/:id
export async function getPersonnelById(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT
                psn.id AS personnel_id,
                psn.f_name,
                psn.l_name,
                psn.nickname,
                psn.color,
                psn.position_id,
                psn.employment_type,
                psn.status,
                psn.kpi_hours,
                psn.max_hours,
                psn.created_at,
                psn.updated_at
            FROM personnels psn
            WHERE psn.id = $1
            ORDER BY psn.id ASC`,[id]);
        
        if(result.rows.length === 0) {
            res.status(404).json({error: "Personnel not found"});
            return;
        }
        const personnel = result.rows[0];
        res.status(200).json(personnel);

    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot get personnels by id"});
    }
}

// POST /api/personnel
export async function createPersonnel(req, res) {
    try {
        const {
            fName,
            lName,
            nickname,
            color,
            position_id,
            employment_type,
            status,
            kpi_hours,
            max_hours,
        } = req.body;

        const result = await pool.query(
            `INSERT INTO personnels
            (f_name, l_name, nickname, color, position_id, employment_type, status, kpi_hours, max_hours)

            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)

            RETURNING
            id, f_name, l_name, nickname, color, position_id, employment_type, status, kpi_hours, max_hours, created_at, updated_at`
            ,[fName, lName, nickname, color, position_id, employment_type, status, kpi_hours, max_hours]
        );

        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, cannot create this personnel"});
    }
}

// PUT /api/personnels/:id
export async function updatePersonnel(req, res) {
    
    try {
        const { id } = req.params;
        const {
            fName,
            lName,
            nickname,
            color,
            position_id,
            employment_type,
            status,
            kpi_hours,
            max_hours,
        } = req.body;

        console.log("check req.body",req.body);
        
        const result = await pool.query(
            `UPDATE personnels
            SET
                f_name = $1,
                l_name = $2,
                nickname = $3,
                color = $4,
                position_id = $5,
                employment_type = $6,
                status = $7,
                kpi_hours = $8,
                max_hours = $9,
                updated_at = NOW()
            WHERE id = $10
            RETURNING id`
            ,[fName, lName, nickname, color, position_id, employment_type, status, kpi_hours, max_hours, id]);
        
        if(result.rowCount === 0) {
            return res.status(404).json({error: "Target personnel not found"});
        }

        const updatedPersonnelID = result.rows[0].id

        const updatedPersonnel = await pool.query(
            `SELECT
                psn.id AS personnel_id,
                psn.f_name,
                psn.l_name,
                psn.nickname,
                psn.color,
                psn.employment_type,
                psn.status,
                psn.kpi_hours,
                psn.max_hours,
                psn.created_at,
                psn.updated_at,
                pos.id AS position_id,
                pos.position AS position_name
            FROM personnels psn
            LEFT JOIN positions pos
                ON psn.position_id = pos.id
            WHERE psn.id = $1
            ORDER BY psn.id ASC`
            ,[updatedPersonnelID]);

        res.status(200).json(updatedPersonnel.rows[0]);

    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, failed to update personnel data"});
    }
}

// DELETE /api/personnel/:id
export async function deletePersonnel(req, res) {
    try {
        const { id } = req.params;
        console.log("confirmed delete id", id);
        
        const result = await pool.query(
            `DELETE from personnels
            WHERE id = $1
            RETURNING id`
            ,[id]);
        if(result.rowCount === 0) {
            return res.status(404).json({error: "Target personnel not found"});
        }
        res.status(200).json({message: "Delete succesfully"});
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, failed to delete personnel data"});
    }
}