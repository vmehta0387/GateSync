const db = require('./backend/src/config/db');

async function test() {
    try {
        const id = 1; // Testing with resident ID 1
        const society_id = 1; // Assuming society_id 1
        const [users] = await db.query('SELECT * FROM Users WHERE id = ? AND society_id = ?', [id, society_id]);
        if (users.length === 0) { console.log('User not found'); return; }
        
        const user = users[0];
        const [flats] = await db.query('SELECT uf.*, f.block_name, f.flat_number FROM User_Flats uf JOIN Flats f ON uf.flat_id = f.id WHERE uf.user_id = ?', [id]);
        const flatData = flats[0] || {};

        const [vehicles] = await db.query('SELECT vehicle_type, vehicle_number, parking_slot FROM Vehicles WHERE user_id = ?', [id]);
        const [family] = await db.query('SELECT name, age, relation, phone_number FROM Family_Members WHERE user_id = ?', [id]);
        
        console.log("Successfully extracted payload:");
        console.log(JSON.stringify({ basic: { name: user.name }, flat: flatData, vehicles, family }, null, 2));
    } catch(e) {
        console.error('Test Failed:', e);
    } finally {
        process.exit();
    }
}
test();
