import pool from "../config/db.js";

// GET /api/sessions
export async function getAllSessions(req, res) {
    try {
        const result = await pool.query(
            `SELECT 
                ss.id,
                ss.day_type,
                ss.room_id,
                rooms.name AS room_name,
                ss.mc_id,
                mc.nickname AS mc_name,
                mcColor.color AS mc_color,
                ss.pd_id,
                pd.nickname AS pd_name,
                pdColor.color AS pd_color,
                ss.session_start,
                ss.session_end,
                ss.created_at,
                ss.updated_at
            FROM sessions ss
            LEFT JOIN personnels mc
                ON ss.mc_id = mc.id
            LEFT JOIN personnels pd
                ON ss.pd_id = pd.id
            LEFT JOIN personnels mcColor
                ON ss.mc_id = mcColor.id
            LEFT JOIN personnels pdColor
                ON ss.pd_id = pdColor.id
            LEFT JOIN rooms
                ON ss.room_id = rooms.id
            ORDER BY ss.session_start ASC`
        );

        const sessions = result.rows;
        res.json(sessions);
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, cannot get sessions" });
    }
}

// GET /api/dayoff
export async function getDayOffSessions(req, res) {
    try {
        const result = await pool.query(
            `SELECT 
                ss.id,
                ss.day_type,
                ss.room_id,
                rooms.name AS room_name,
                ss.mc_id,
                mc.nickname AS mc_name,
                ss.pd_id,
                pd.nickname AS pd_name,
                ss.session_start,
                ss.session_end,
                ss.created_at,
                ss.updated_at                      
            FROM sessions ss
            LEFT JOIN personnels mc
                ON ss.mc_id = mc.id
            LEFT JOIN personnels pd
                ON ss.pd_id = pd.id
            LEFT JOIN rooms
                ON ss.room_id = rooms.id
            WHERE ss.day_type = 'dayoff'
            ORDER BY ss.session_start ASC`
        );

        const sessions = result.rows;
        if(result.rows.length === 0) {
            res.json({message: "No dayoff session has been added. Please add dayoff"});
            return;
        }
        res.json(sessions);
    } catch (err) {
        console.log("Update Session PATCH error",err);
        res.status(500).json({ error: err.message || "Server error, cannot get sessions" });
    }
}

// GET /api/sessions/:id
export async function getSessionById(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                ss.id,
                ss.day_type,
                ss.room_id,
                rooms.name AS room_name,
                ss.mc_id,
                mc.nickname AS mc_name,
                ss.pd_id,
                pd.nickname AS pd_name,
                ss.session_start,
                ss.session_end,
                ss.created_at,
                ss.updated_at
            FROM sessions ss
            LEFT JOIN personnels mc
                ON ss.mc_id = mc.id
            LEFT JOIN personnels pd
                ON ss.pd_id = pd.id
            LEFT JOIN rooms
                ON ss.room_id = rooms.id
            WHERE ss.id = $1
            ORDER BY ss.session_start
            `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Session not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.log(err);
        res.status(500).json({error: "Server error, failed fetching sessions"});
    }
}

// POST /api/sessions

const MC_MAX_HOURS = 124;
const PD_MAX_HOURS = 176;

function hoursBetween(start, end) {
    return (new Date(end) - new Date(start)) / (1000 * 60 * 60);
}

export async function createSession(req, res) {
    const {
        day_type,
        room_id, 
        mc_id, 
        pd_id, 
        session_start, 
        session_end, 
    } = req.body;

    const newStart = new Date(session_start);
    const newEnd = new Date(session_end);

    if(isNaN(newStart) || isNaN(newEnd)) {
        return res.status(400).json({error: "Date format incorrect"})
    }
    if(newStart >= newEnd) {
        return res.status(400).json({error: "'Start Date' cannot be the same or more than 'End Date'"})
    }

    try {
        const isNonWorkingDay = day_type !== "working day";

        if (!isNonWorkingDay) {

            // fetch name list
            const [mcListResult, roomListResult] = await Promise.all([
                pool.query("SELECT nickname FROM personnels WHERE id = $1", [mc_id]),
                pool.query("SELECT name FROM rooms WHERE id = $1", [room_id]),
            ]);

            if (!mcListResult.rows.length) 
                return res.status(400).json({error: "MC not found"});

            if (!roomListResult.rows.length) 
                return res.status(400).json({error: "Room not found"});

            const mcName = mcListResult.rows[0].nickname;
            const roomName = roomListResult.rows[0].name;
            const isContentRoom = roomName.toLowerCase().includes("content room");

            // overlap session validation

            const [overlapMC, overlapPD, overlapRoom] = await Promise.all([
                pool.query(
                    `SELECT 1 FROM sessions
                    WHERE mc_id = $1
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                    ,[mc_id, session_start, session_end]
                ),
                isContentRoom ? { rows: [] } : pool.query(
                    `SELECT 1 FROM sessions
                    WHERE pd_id = $1
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                    ,[pd_id, session_start, session_end]
                ),
                pool.query(
                    `SELECT 1 FROM sessions
                    WHERE room_id = $1
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                ,[room_id, session_start, session_end]
                ),
            ])

            if (overlapMC.rows.length) {
                console.log(overlapMC);
                
                return res.status(400).json({error: `Session duplicate for ${mcName}`})
            }

            if (!isContentRoom && overlapPD.rows.length) {
                return res.status(400).json({error: `Session duplicate for ${pdName}`})
            }

            if (overlapRoom.rows.length) {
                return res.status(400).json({error: `Session duplicate for ${roomName}`});
            }

            // checking if each MC/PD has personal dayoff

            const [mcDayOff, pdDayOff] = await Promise.all([
                pool.query(
                    `SELECT 1 FROM personal_dayoffs
                    WHERE personnel_id = $1
                        AND dayoff_status = 'approved'
                        AND $2 BETWEEN dayoff_start AND dayoff_end`
                    ,[mc_id, session_start]
                ),
                isContentRoom ? { rows: [] } : pool.query(
                    `SELECT 1 FROM personal_dayoffs
                    WHERE personnel_id = $1
                        AND dayoff_status = 'approved'
                        AND $2 BETWEEN dayoff_start AND dayoff_end`
                    ,[pd_id, session_start]
                ),
            ]);

            if (mcDayOff.rows.length) {
                return res.status(400).json({error: "This MC take leave today"});
            }

            if (!isContentRoom && pdDayOff.rows.length) {
                return res.status(400).json({error: "This PD take leave today"});
            }   

            // validate global dayoff 
            
            const globalDayOff = await pool.query(
                `SELECT 1 from sessions
                WHERE day_type = 'dayoff'
                    AND NOT (session_end <= $1 OR session_start >= $2)`
                ,[session_start, session_end]
            );

            if(globalDayOff.rows.length) {
                return res.status(400).json({error: "Selected day is global dayoff. Cannot create session"});
            }   
            
            // --- Fulltime Hours Check (skip for content room) ---
            
            if(!isContentRoom) {

                const [mcInfo, pdInfo] = await Promise.all([
                    pool.query(`SELECT employment_type FROM personnels WHERE id = $1`,[mc_id]),
                    pool.query(`SELECT employment_type FROM personnels WHERE id = $1`,[pd_id]),
                ])

                if(mcInfo.rows[0].employment_type === "fulltime") {
                    const {rows: [{total: mcTotal}]} = await pool.query(
                        `SELECT 
                        COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0) AS total
                        FROM sessions
                        WHERE mc_id = $1`
                        ,[mc_id]
                    );

                    if(parseFloat(mcTotal) + hoursBetween(session_start, session_end) > MC_MAX_HOURS) {
                        return res.status(400).json({error: `Exceed max hours of ${MC_MAX_HOURS} for this fulltime MC`});
                    }
                }

                if(pdInfo.rows[0].employment_type === "fulltime") {
                    const {rows: [{total: pdTotal}]} = await pool.query(
                        `SELECT 
                        COALESCE(SUM(EXTRACT(EPOCH FROM(session_end - session_start))/3600), 0) AS total
                        FROM sessions
                        WHERE pd_id = $1`
                        ,[pd_id]
                    );

                    if(parseFloat(pdTotal) + hoursBetween(session_start, session_end) > PD_MAX_HOURS) {
                        return res.status(400).json({error: `Exceed max hours of ${PD_MAX_HOURS} for this fulltime PD`});
                    }
                }
            }

        }

        // --- Insert Session ---

        const insertResult = await pool.query(`
            INSERT INTO sessions
            (day_type, room_id, mc_id, pd_id, session_start, session_end)

            VALUES
            ($1, $2, $3, $4, $5, $6)

            RETURNING *`
            ,[day_type, room_id || null, mc_id || null, pd_id || null, session_start, session_end]
        );

        const sessionId = insertResult.rows[0].id;

        const { rows: [fullSession] } = await pool.query(`
            SELECT
                ss.id,
                ss.day_type,
                ss.session_start,
                ss.session_end,
                ss.room_id,
                r.name    AS room_name,
                ss.mc_id,
                mc.nickname AS mc_name,
                ss.pd_id,
                pd.nickname AS pd_name
            FROM sessions ss
            LEFT JOIN rooms r ON ss.room_id = r.id
            LEFT JOIN personnels mc ON ss.mc_id   = mc.id
            LEFT JOIN personnels pd ON ss.pd_id   = pd.id
            WHERE ss.id = $1
            `, [sessionId]
        );

        return res.status(201).json(fullSession);

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server error, failed create sessions"});
    }
}

// PUT /api/sessions/:id
export async function updateSession(req, res) {

    if (req.method === "PUT") {
        const { id } = req.params;
        const {
            day_type: putBodyDayType,
            room_id: putBodyRoomId, 
            mc_id: putBodyMcId, 
            pd_id: putBodyPdId,
            session_start, 
            session_end, 
        } = req.body;
        try {
            const newStart = new Date(session_start);
            const newEnd = new Date(session_end);

            if(isNaN(newStart) || isNaN(newEnd))
                return res.status(400).json({error: "Incorrect date format"});

            if (newStart >= newEnd) {
                return res.status(400).json({error: "'Start Date' cannot be more than or equal to 'End Date'"});
            };

            // 2. ยืนยันว่า session นั้นมีอยู่จริง
            const {rows: existing} = await pool.query(
                `SELECT * FROM sessions WHERE id = $1`
                ,[id]
            );

            if (!existing.length) {
                return res.status(404).json({error: "Target session not found"});
            };

            const targetSession = existing[0];
            const dayType = putBodyDayType ?? targetSession.day_type
            const roomId = putBodyRoomId ?? targetSession.room_id
            const mcId = putBodyMcId ?? targetSession.mc_id
            const pdId = putBodyPdId ?? targetSession.pd_id

            const isNonWorkingDay = dayType !== "working day"

            if (!isNonWorkingDay) {
                    // 3. ดึงชื่อ MC/PD/Room (เหมือน createSession)
                const [mcListResult, roomListResult] = await Promise.all([
                    pool.query(`SELECT nickname FROM personnels WHERE id = $1`,[mcId]),
                    pool.query(`SELECT name FROM rooms WHERE id = $1`,[roomId]),
                ]);

                if (!mcListResult.rows.length) 
                    return res.status(400).json({error: "MC not found"});

                if (!roomListResult.rows.length) 
                    return res.status(400).json({error: "Room not found"});

                // 4. เช็ค overlap แต่ข้ามตัวเอง (id != $4)
                const mcName = mcListResult.rows[0].nickname || "Unknown MC";
                const roomName = roomListResult.rows[0].name || "Unknown Room";
                const isContentRoom = roomName.toLowerCase().includes("content room");

                let pdName = "";
                if (!isContentRoom && pdId) {
                    const pdResult = await pool.query(`SELECT nickname FROM personnels WHERE id = $1`, [pdId]);
                    pdName = pdResult.rows[0]?.nickname;
                }

                const [overlapMC, overlapPD, overlapRoom] = await Promise.all([
                    pool.query(
                        `SELECT 1 FROM sessions
                        WHERE mc_id = $1
                        AND id != $4
                        AND NOT (session_end <= $2 OR session_start >= $3)`
                        ,[mcId, newStart, newEnd, id]
                    ),
                    isContentRoom ? { rows: [] } : pool.query(
                        `SELECT 1 FROM sessions
                        WHERE pd_id = $1
                        AND id != $4
                        AND NOT (session_end <= $2 OR session_start >= $3)`
                        ,[pdId, newStart, newEnd,id]
                    ),
                    pool.query(
                        `SELECT 1 FROM sessions
                        WHERE room_id = $1 AND id != $4
                        AND NOT (session_end <= $2 OR session_start >= $3)`
                        ,[roomId, newStart, newEnd, id]
                    ),
                ]);

                if (overlapMC.rows.length) {
                    return res.status(400).json({error: `MC: ${mcName} has overlapping sessions`})
                };

                if (!isContentRoom && overlapPD.rows.length) {
                    return res.status(400).json({error: `PD: ${pdName} has overlapping sessions`})
                };

                if (overlapRoom.rows.length) {
                    return res.status(400).json({error: `Room: ${roomName} has overlapping sessions`})
                };

                // เช็ควันลาส่วนบุคคล
                const [mcDayOff, pdDayOff] = await Promise.all([
                    pool.query(
                        `SELECT 1 FROM personal_dayoffs
                        WHERE personnel_id = $1
                        AND dayoff_status = 'approved'
                        AND $2 BETWEEN dayoff_start AND dayoff_end`
                        ,[mcId, newStart]
                    ),
                    isContentRoom ? { rows: [] } : pool.query(
                        `SELECT 1 FROM personal_dayoffs
                        WHERE personnel_id = $1
                        AND dayoff_status = 'approved'
                        AND $2 BETWEEN dayoff_start AND dayoff_end`
                        ,[pdId, newStart]
                    ),
                ]);

                if (mcDayOff.rows.length) {
                    return res.status(400).json({error: `MC ${mcName} take leave today`});
                };

                if (!isContentRoom && pdDayOff.rows.length) {
                    return res.status(400).json({error: `PD ${pdName} take leave today`});
                } else if (isContentRoom && pdDayOff.rows.length) {
                    return;
                };

                // เช็ค global dayoff
                const globalDayOff = await pool.query(
                    `SELECT 1 FROM sessions 
                    WHERE day_type = 'dayoff'
                    AND id != $3
                    AND NOT (session_end <= $1 OR session_start >= $2)`
                    ,[newStart, newEnd, id]
                );

                if (globalDayOff.rows.length) {
                    return res.status(400).json({error: "Selected day is global dayoff. Cannot update session"});
                }; 

                // 5. เช็คชั่วโมงสะสมแบบ fulltime (ข้ามตัวเองด้วย)
                if (!isContentRoom) {
                    const [mcInfo, pdInfo] = await Promise.all([
                        pool.query(`SELECT employment_type FROM personnels WHERE id = $1`,[mcId]),
                        pool.query(`SELECT employment_type FROM personnels WHERE id = $1`,[pdId]),
                    ]);

                    if (mcInfo.rows[0].employment_type === "fulltime") {
                        const { rows: [{total: mcTotal}] } = await pool.query(
                            `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM session_end - session_start))/3600, 0) AS total
                            FROM sessions
                            WHERE mc_id = $1 AND id != $2`
                            ,[mcId, id]);

                        if (parseFloat(mcTotal) + hoursBetween(session_start, session_end) > MC_MAX_HOURS) {
                            return res.status(400).json({
                                error: `Exceed max hours of ${MC_MAX_HOURS} for this fulltime MC`
                            })
                        }
                    };

                    if (pdInfo.rows[0].employment_type === "fulltime") {
                        const { rows: [{total: pdTotal}]} = await pool.query(
                            `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM session_end - session_start))/3600, 0) AS total
                            FROM sessions
                            WHERE pd_id = $1 AND id != $2`
                            ,[pdId, id]
                        );
                        
                        if (parseFloat(pdTotal) + hoursBetween(session_start, session_end) > PD_MAX_HOURS) {
                            return res.status(400).json({
                                error: `Exceed max hours of ${PD_MAX_HOURS} for this fulltime PD`
                            })
                        }
                    };
                };  
            };

            // 8. ถ้าผ่านทุกข้อ ให้ UPDATE
            const updateResult = await pool.query(`
                UPDATE sessions
                SET 
                    day_type = $1,
                    room_id = $2,
                    mc_id = $3,
                    pd_id = $4,
                    session_start = $5, 
                    session_end = $6, 
                    updated_at = NOW()
                WHERE id = $7
                RETURNING *`
                ,[dayType, roomId, mcId, pdId, newStart, newEnd, id]);

            if(updateResult.rowCount === 0){
                return res.status(404).json({error: "Target session not found"});
            }
            
            // ส่งข้อมูลที่เพิ่งอัปเดทกลับไปแสดงผล
            const sessionId = updateResult.rows[0].id;

            const { rows: [formUpdatedSession] } = await pool.query(`
                SELECT
                    ss.id,
                    ss.day_type,
                    ss.session_start,
                    ss.session_end,
                    ss.room_id,
                    r.name    AS room_name,
                    ss.mc_id,
                    mc.nickname AS mc_name,
                    ss.pd_id,
                    pd.nickname AS pd_name
                FROM sessions ss
                LEFT JOIN rooms r ON ss.room_id = r.id
                LEFT JOIN personnels mc ON ss.mc_id   = mc.id
                LEFT JOIN personnels pd ON ss.pd_id   = pd.id
                WHERE ss.id = $1
                `, [sessionId]
            );

            return res.status(201).json(formUpdatedSession);
        
    } catch (err) {
        console.log("Update session error: ", err);
    }
    } else if (req.method === "PATCH") {
    const { id } = req.params;
    const {
      day_type: bodyDayType,
      room_id: bodyRoomId,
      mc_id: bodyMcId,
      pd_id: bodyPdId,
      session_start,
      session_end,
    } = req.body;

    try {
    const newStart = new Date(session_start);
    const newEnd = new Date(session_end);

    if(isNaN(newStart) || isNaN(newEnd)) {
        return res.status(400).json({error: "Incorrect date format"});
    }

    if (newStart >= newEnd) {
        return res.status(400).json({error: "'Start Date' cannot be more than or equal to 'End Date'"});
    }

    // 2. ยืนยันว่า session นั้นมีอยู่จริง
    const {rows: existingSession} = await pool.query(
        `SELECT * FROM sessions WHERE id = $1`
        ,[id]
    );

    if (!existingSession.length) {
        return res.status(404).json({error: "Target session not found"});
    }

    const targetSession = existingSession[0];
    const dayType = bodyDayType ?? targetSession.day_type
    const roomId = bodyRoomId ?? targetSession.room_id
    const mcId = bodyMcId ?? targetSession.mc_id    
    const pdId = bodyPdId ?? targetSession.pd_id

    // ดึงชื่อ MC/PD/Room (เหมือน createSession)
    const isNonWorkingDay = dayType !== "working day" // true = 'dayoff' false = 'working day' false as default

    if (!isNonWorkingDay) {

            const [mcListResult, roomListResult] = await Promise.all([
                pool.query(`SELECT nickname FROM personnels WHERE id = $1`,[mcId]),
                pool.query(`SELECT name FROM rooms WHERE id = $1`,[roomId]),
            ]);

            const mcName = mcListResult.rows[0].nickname || "Unknown MC";
            const roomName = roomListResult.rows[0].name || "Unknown Room";
            const isContentRoom = roomName.toLowerCase().includes("content room"); 
            // มีคำว่า content room -> true,  ไม่มี --> false 

            let pdName = "";
            if (!isContentRoom && pdId) {
            const pdResult = await pool.query(`SELECT nickname FROM personnels WHERE id = $1`, [pdId]);
            pdName = pdResult.rows[0]?.nickname;
            }

            // 3. เช็ค overlap แต่ข้ามตัวเอง (id != $4)

            const [overlapMC, overlapPD, overlapRoom] = await Promise.all([
                pool.query(
                    `SELECT 1 FROM sessions
                    WHERE mc_id = $1
                    AND id != $4
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                    ,[mcId, newStart, newEnd, id]
                ),
                isContentRoom ? { rows: [] } : pool.query(
                    `SELECT 1 FROM sessions
                    WHERE pd_id = $1
                    AND id != $4
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                    ,[pdId, newStart, newEnd, id]
                ),
                pool.query(
                    `SELECT 1 FROM sessions
                    WHERE room_id = $1 AND id != $4
                    AND NOT (session_end <= $2 OR session_start >= $3)`
                    ,[roomId, newStart, newEnd, id]
                ),
            ]);
            console.log("check overlap", overlapMC.rows, overlapPD.rows, overlapRoom.rows);

            if (overlapMC.rows.length) {
                return res.status(400).json({error: `MC: ${mcName} has overlapping sessions`})
            }

            if (!isContentRoom && overlapPD.rows.length) {
                return res.status(400).json({error: `PD: ${pdName} has overlapping sessions`})
            }

            if (overlapRoom.rows.length) {
                return res.status(400).json({error: `Room: ${roomName} has overlapping sessions`})
            }      
            
            // 6. เช็ควันลาส่วนบุคคล (เหมือน create)
            console.log("check mc id before query dayoff", pdId);
            
            const [mcDayOff, pdDayOff] = await Promise.all([
                pool.query(
                    `SELECT 1 FROM personal_dayoffs
                    WHERE personnel_id = $1
                    AND dayoff_status = 'approved'
                    AND $2 BETWEEN dayoff_start AND dayoff_end`
                    ,[mcId, newStart]
                ),
                isContentRoom ? { rows: [] } : pool.query(
                    `SELECT 1 FROM personal_dayoffs
                    WHERE personnel_id = $1
                    AND dayoff_status = 'approved'
                    AND $2 BETWEEN dayoff_start AND dayoff_end`
                    ,[pdId, newStart]
                ),
            ]);
            console.log("check pd day off", pdDayOff.rows);
            

            if (mcDayOff.rows.length) {
                return res.status(400).json({error: `MC : ${mcName} take leave today`});
            };

            if (!isContentRoom && pdDayOff.rows.length) {
                return res.status(400).json({error: `PD : ${pdName} take leave today`});
            } else if (isContentRoom && pdDayOff.rows.length) {
                return;
            };

            // 7. เช็ค global dayoff
            const globalDayOff = await pool.query(
                `SELECT 1 FROM sessions 
                WHERE day_type = 'dayoff'
                AND id != $3
                AND NOT (session_end <= $1 OR session_start >= $2)`
                ,[newStart, newEnd, id]
            );

            if (globalDayOff.rows.length) {
                return res.status(400).json({error: "New timeslot is global dayoff. Cannot update session"});
            }  
    } 

    // 8. ถ้าผ่านทุกข้อ ให้ UPDATE
    const updateResult = await pool.query(`
        UPDATE sessions
        SET 
            session_start = $1, 
            session_end = $2, 
            updated_at = NOW()
        WHERE id = $3
        RETURNING *`
        ,[newStart, newEnd, id]);

        if(updateResult.rowCount === 0){
            return res.status(404).json({error: "Session not found during update"});
        }

        // ส่งข้อมูลที่เพิ่งอัปเดทกลับไปแสดงผล
        const sessionId = updateResult.rows[0].id;

        const { rows: [DnDupdatedSession] } = await pool.query(`
            SELECT
                ss.id,
                ss.day_type,
                ss.session_start,
                ss.session_end,
                ss.room_id,
                r.name    AS room_name,
                ss.mc_id,
                mc.nickname AS mc_name,
                ss.pd_id,
                pd.nickname AS pd_name
            FROM sessions ss
            LEFT JOIN rooms r ON ss.room_id = r.id
            LEFT JOIN personnels mc ON ss.mc_id   = mc.id
            LEFT JOIN personnels pd ON ss.pd_id   = pd.id
            WHERE ss.id = $1
            `, [sessionId]
        );
        console.log("DnD session", DnDupdatedSession);
        return res.status(201).json(DnDupdatedSession);
} catch (err) {
    console.log("Update session error [PATCH]: ", err);
    res.status(400).json({error: err.message || "Invalid data or constraint violation"});
} 
    }
};


// DELETE /api/sessions/:id
export async function deleteSession(req, res) {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            DELETE FROM sessions 
            WHERE id = $1
            RETURNING id`
            ,[id]);

        if(result.rowCount === 0) {
            return res.status(404).json({error: "Target session not found"});
        }
        res.status(200).json({message: "Delete succesfully"});
    } catch (err) {
        console.log("Delete session error: ", err);
        res.status(400).json({error: "Server error, Unsuccessfully delete session"});
    }
}