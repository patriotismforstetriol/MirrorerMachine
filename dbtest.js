const mariadb = require('mariadb');
const { dbUsername, dbHostname, dbPw } = require('./config.json');

const pool = mariadb.createPool({
	host: dbHostname,
	user: dbUsername,
	password: dbPw,
	connectionLimit: 5,
});

async function connectionAttempt() {
	let conn;
	try {
		conn = await pool.getConnection();
		await conn.query('USE forums;');
		const rows = await conn.query('SHOW TABLES;');
		console.log(rows);
		conn.end();
	} catch (err) {
		console.log('Failed to connect to db due to ', err);
	}
}

connectionAttempt();