const fs = require('fs');
const file = './frontend/src/app/admin/residents/page.tsx';
let txt = fs.readFileSync(file, 'utf8');
const searchRef = `<button title="Edit Profile" onClick={() => { setEditingResident(r); setEditFormData({ name: r.name, email: r.email, phone_number: r.phone_number }); }} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 rounded-lg transition-colors mr-1"><Edit2 className="w-4 h-4" /></button>`;
const replacement = `<button title="Edit Full Profile" onClick={() => router.push(\`/admin/residents/edit/\${r.id}\`)} className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 rounded-lg transition-colors mr-1"><Edit2 className="w-4 h-4" /></button>`;
fs.writeFileSync(file, txt.replace(searchRef, replacement));
console.log('Route swapped');
