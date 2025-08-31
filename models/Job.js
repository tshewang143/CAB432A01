const { getDb } = require('../config/database');

function create(userId, originalFilename, title = null, description = null, filePath = null) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `INSERT INTO jobs (user_id, original_filename, title, description, file_path, status) VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [userId, originalFilename, title, description, filePath, 'queued'], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.lastID);
      }
    });
  });
}

function findByUser(userId, page = 1, limit = 10, status = null, sortBy = 'created_at', sortOrder = 'DESC') {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const offset = (page - 1) * limit;
    
    let sql = `SELECT * FROM jobs WHERE user_id = ?`;
    let params = [userId];
    
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    
    sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        let countSql = `SELECT COUNT(*) as total FROM jobs WHERE user_id = ?`;
        let countParams = [userId];
        
        if (status) {
          countSql += ` AND status = ?`;
          countParams.push(status);
        }
        
        db.get(countSql, countParams, (err, countResult) => {
          if (err) {
            reject(err);
          } else {
            resolve({
              jobs: rows,
              pagination: {
                page: page,
                limit: limit,
                total: countResult.total,
                pages: Math.ceil(countResult.total / limit)
              }
            });
          }
        });
      }
    });
  });
}

function findByIdAndUser(jobId, userId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `SELECT * FROM jobs WHERE id = ? AND user_id = ?`;
    
    db.get(sql, [jobId, userId], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function update(jobId, title, description) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `UPDATE jobs SET title = ?, description = ? WHERE id = ?`;
    
    db.run(sql, [title, description, jobId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

function updateStatus(jobId, status, errorMessage = null) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `UPDATE jobs SET status = ?, error_message = ?, completed_at = ? WHERE id = ?`;
    const completedAt = status === 'completed' ? new Date().toISOString() : null;
    
    db.run(sql, [status, errorMessage, completedAt, jobId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

function remove(jobId) {
  return new Promise((resolve, reject) => {
    const db = getDb();
    const sql = `DELETE FROM jobs WHERE id = ?`;
    
    db.run(sql, [jobId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes);
      }
    });
  });
}

module.exports = {
  create,
  findByUser,
  findByIdAndUser,
  update,
  updateStatus,
  remove
};