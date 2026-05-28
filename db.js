const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.json');

const COMO_CONHECEU_SEED = [
  'AJUBEMGE','ANA PAULA','ANASPS','APP AGENDAMENTO','BALOAR',
  'CAMPANHA - ANATEL','CAMPANHA - EZPAY','CAMPANHA - GGC','CAMPANHA - INVEST MINAS',
  'CAMPANHA - MILLS LOCACAO','CAMPANHA - MULTOTEC','CAMPANHA - POTTENCIAL',
  'CAMPANHA - SEST SENAT','CAMPANHA - TERRAZA','CAMPANHA - XP',
  'CAMPANHA CLINICA IMAGEM','CARDIOGERAES','CHAT GPT','CLINICA ALPES',
  'CLUBE ASBEMGE','CONGREGACAO IRMAS CARMELITAS','CONHECIA O LOCAL','CONVENIO - TRT',
  'DIA Z - APCEF','DIA Z - ASLEMG','DIA Z - CLAUDIA LODI','DIA Z - COOPEDER',
  'DIA Z - DRA LIANA','DIA Z - DRA MONICA','DIA Z - DRA. BEATRIZ','DIA Z - DRA. MARTHA',
  'DIA Z - EMS','DIA Z - KATIA DO VALE','DIA Z - MAURICIO ZANON','DIA Z - MEDCENTER',
  'DR. PAULO LENER','FACEBOOK','GOOGLE','INDICACAO DE AMIGO(A)','INDICACAO DE FAMILIAR',
  'INFLUENCER - GABI VIDIGAL','INFLUENCER - MARINA','INFLUENCER - NATHALIA',
  'INSTAGRAM','INSTAGRAM - THAY','LEO','MAE - TOMOU ABRYSVO',
  'MEDICO - DR CLAUDIO CANDIANI','MEDICO - DR JUVANE NAVES','MEDICO - DR MARCOS CATIZANI',
  'MEDICO - DR NESTOR','MEDICO - DR PAULO JOSE PIMENTA','MEDICO - DR RENAN SALGADO TEIXEIRA',
  'MEDICO - DR. CAIO MOREIRA','MEDICO - DR. FABIANO MORAES','MEDICO - DR. FLAVIO MENDONCA',
  'MEDICO - DR. FRANSCISCO MOURAO','MEDICO - DR. JOSE COPERTINO','MEDICO - DR. JULIANO',
  'MEDICO - DR. LEONARDO AUGUSTO','MEDICO - DR. LEONARDO MEIRA','MEDICO - DR. LEOPOLDO',
  'MEDICO - DR. MARCOS VASCONCELOS','MEDICO - DR. MARIO OSCAR',
  'MEDICO - DR. NEANDER DE SOUZA FERREIRA','MEDICO - DR. OLAVO DIAS',
  'MEDICO - DR. OSVALDO ELI','MEDICO - DR. PAULO JOSE PIMENTA','MEDICO - DR. PEDRO ROMANNELI',
  'MEDICO - DRA ROSANGELA CRISTINA','MEDICO - DRA. ADELAIDE','MEDICO - DRA. ANA PAULA SCALIA',
  'MEDICO - DRA. BEATRIZ MIARELI','MEDICO - DRA. CAROLINA CAPURUCO',
  'MEDICO - DRA. CECILIA SHIMOYA','MEDICO - DRA. CLAUDIA BARBOSA',
  'MEDICO - DRA. CRISTIANA FONSECA BEUMOND','MEDICO - DRA. DANIELLE BOSSI',
  'MEDICO - DRA. DEBORA PEREIRA','MEDICO - DRA. DENISE SOARES','MEDICO - DRA. DIANA CARVALHO',
  'MEDICO - DRA. FLAVIA C ALVARENGA','MEDICO - DRA. JULIANA MONTIJO',
  'MEDICO - DRA. JUNIA MARIA SAMPAIO','MEDICO - DRA. KATIA DO VALE',
  'MEDICO - DRA. LIVIA CRISTINE','MEDICO - DRA. LORENA BREGUNCI',
  'MEDICO - DRA. MARIA EUGENIA DE SOUZA','MEDICO - DRA. MARIA LETICIA RAMOS',
  'MEDICO - DRA. MARIA TERCILIA','MEDICO - DRA. MARLI DE OLIVEIRA',
  'MEDICO - DRA. MICHELLE ANDREATA','MEDICO - DRA. NARA SULMONETT',
  'MEDICO - DRA. PAULA GUASTAFERRO','MEDICO - DRA. RAQUEL MARIA OLIVEIRA',
  'MEDICO - DRA. REGINA','MEDICO - DRA. RENATA BEDRAN','MEDICO - DRA. RITA DE CASSIA',
  'MEDICO - DRA. ROSANGELA PAMPOLINI','MEDICO - DRA. ROSELAINE','MEDICO - DRA. SORAYA FARAH',
  'MEDICO - DRA. VALENTINA GOMES','MEDICO - DRA. VALERIA',
  'MEDICO - PAULINO MENDONCA DE SOUZA','MEDICO - PREENCHER OBSERVACAO',
  'NAM NUCLEO DE APOIO MATURIDADE','PARCERIA ASSOCIACAO MEDICA MG',
  'PARCERIA CUIDATI','PARCERIA MULTI MEDICOS','PETROBRAS','PLACA','PULMONAR',
  'RESIDENCIAL GUTIERREZ','VINI',
];

function load() {
  if (fs.existsSync(DB_PATH)) {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch {}
  }
  return { users: [], logs: [], comoConheceu: [], nextUserId: 1, nextLogId: 1, nextComoConheceuId: 1 };
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
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

  comoConheceu: {
    getAll() {
      const data = load();
      return [...(data.comoConheceu || [])].sort((a, b) => a.label.localeCompare(b.label));
    },
    create(label) {
      const data = load();
      if (!data.comoConheceu) data.comoConheceu = [];
      if (!data.nextComoConheceuId) data.nextComoConheceuId = 1;
      const item = { id: data.nextComoConheceuId++, label };
      data.comoConheceu.push(item);
      save(data);
      return item;
    },
    delete(id) {
      const data = load();
      data.comoConheceu = (data.comoConheceu || []).filter(c => c.id !== parseInt(id));
      save(data);
    },
  },
};

function initDb() {
  if (!fs.existsSync(DB_PATH)) save({ users: [], logs: [], comoConheceu: [], nextUserId: 1, nextLogId: 1, nextComoConheceuId: 1 });

  if (db.users.count() === 0) {
    db.users.create('Administrador', 'admin@climep.com.br', bcrypt.hashSync('climep2024', 10), 'admin');
    console.log('\n=== USUÁRIO ADMIN CRIADO ===');
    console.log('Email: admin@climep.com.br');
    console.log('Senha: climep2024');
    console.log('ALTERE A SENHA APÓS O PRIMEIRO ACESSO!\n');
  }

  if (db.comoConheceu.getAll().length === 0) {
    COMO_CONHECEU_SEED.forEach(label => db.comoConheceu.create(label));
    console.log(`${COMO_CONHECEU_SEED.length} opções de "como conheceu" carregadas.`);
  }
}

module.exports = { db, initDb };
