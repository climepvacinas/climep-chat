const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

function load() {
  if (fs.existsSync(DB_PATH)) {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch {}
  }
  return { users: [], logs: [], nextUserId: 1, nextLogId: 1 };
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data), 'utf8');
}

const db = {
  users: {
    getAll() {
      return [...load().users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    getByEmail(email) {
      return load().users.find(u => u.email === email) || null;
    },
    getById(id) {
      return load().users.find(u => u.id === parseInt(id)) || null;
    },
    count() {
      return load().users.length;
    },
    create(name, email, password, role) {
      const data = load();
      if (data.users.find(u => u.email === email)) throw new Error('EMAIL_EXISTS');
      const user = { id: data.nextUserId++, name, email, password, role, created_at: new Date().toISOString() };
      data.users.push(user);
      save(data);
      return user;
    },
    updatePassword(id, hash) {
      const data = load();
      const u = data.users.find(u => u.id === parseInt(id));
      if (u) { u.password = hash; save(data); }
    },
    delete(id) {
      const data = load();
      data.users = data.users.filter(u => u.id !== parseInt(id));
      save(data);
    },
  },

  logs: {
    create(entry) {
      const data = load();
      const log = { id: data.nextLogId++, ...entry, created_at: new Date().toISOString() };
      data.logs.push(log);
      if (data.logs.length > 2000) data.logs = data.logs.slice(-2000);
      save(data);
      return log;
    },
    getAll({ status, user_id, limit = 200 } = {}) {
      let logs = [...load().logs].reverse();
      if (status) logs = logs.filter(l => l.status === status);
      if (user_id) logs = logs.filter(l => l.user_id === parseInt(user_id));
      return logs.slice(0, parseInt(limit));
    },
  },
};

function initDb() {
  if (!fs.existsSync(DB_PATH)) save({ users: [], logs: [], nextUserId: 1, nextLogId: 1 });

  if (db.users.count() === 0) {
    db.users.create('Administrador', 'admin@climep.com.br', bcrypt.hashSync('climep2024', 10), 'admin');
    console.log('\n=== USUÁRIO ADMIN CRIADO ===');
    console.log('Email: admin@climep.com.br');
    console.log('Senha: climep2024');
    console.log('ALTERE A SENHA APÓS O PRIMEIRO ACESSO!\n');
  }
}

module.exports = { db, initDb };
