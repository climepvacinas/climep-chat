require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { db, initDb } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'climep-jwt-dev-secret';
const IMUNEWEB_BASE = process.env.IMUNEWEB_BASE || 'https://sistema.imuneweb6.com.br/api/climephml/v1';
const IMUNEWEB_USER = process.env.IMUNEWEB_USER || 'usuarioTeste';
const IMUNEWEB_TOKEN = process.env.IMUNEWEB_TOKEN || '4E7E1FB2E39F41CE8FA1517';

// ── Middlewares ───────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado' });
    next();
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

  const user = db.users.getByEmail(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

// ── CEP lookup ────────────────────────────────────────────────────────────────

app.get('/api/cep/:cep', requireAuth, async (req, res) => {
  try {
    const cep = req.params.cep.replace(/\D/g, '');
    if (cep.length !== 8) return res.status(400).json({ error: 'CEP inválido' });
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await r.json();
    if (data.erro) return res.status(404).json({ error: 'CEP não encontrado' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Erro ao consultar CEP' });
  }
});

// ── Cadastro de paciente ──────────────────────────────────────────────────────

app.post('/api/register', requireAuth, async (req, res) => {
  const { formData } = req.body;
  if (!formData) return res.status(400).json({ error: 'Dados não fornecidos' });

  const clean = v => (v || '').toString().trim().replace(/\s+/g, ' ');
  const digits = v => clean(v).replace(/\D/g, '');

  try {
    const params = new URLSearchParams();
    params.append('usuario', IMUNEWEB_USER);
    params.append('token', IMUNEWEB_TOKEN);
    params.append('nome', clean(formData.nome));
    params.append('dtNascimento', clean(formData.dtNascimento).replace(/\s/g, ''));
    params.append('sexo', clean(formData.sexo));
    params.append('mae', clean(formData.mae));
    params.append('pai', clean(formData.pai));
    params.append('cpf', digits(formData.cpf));
    params.append('email', clean(formData.email));
    params.append('celular', digits(formData.celular));
    params.append('cep', digits(formData.cep));
    params.append('endereco', clean(formData.endereco));
    params.append('numero', clean(formData.numero));
    params.append('complemento', clean(formData.complemento));
    params.append('bairro', clean(formData.bairro));
    params.append('cidade', clean(formData.cidade));
    params.append('uf', clean(formData.uf));
    params.append('responsavelFinanceiro', clean(formData.responsavelFinanceiro));
    params.append('cpfResponsavelFinanceiro', digits(formData.cpfResponsavelFinanceiro));

    const response = await fetch(`${IMUNEWEB_BASE}/paciente/cadastro`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const rawText = await response.text();
    let result;
    try { result = JSON.parse(rawText); } catch { result = { raw: rawText }; }

    // A API retorna: {"status":"sucesso","dados":{"pacienteId":"69"}}
    // ou            {"status":"erro","mensagem":"...","dados":null}
    if (result?.status === 'erro') {
      const apiMsg = result?.mensagem || 'Erro retornado pela API do imuneweb';
      db.logs.create({
        user_id: req.user.id, user_name: req.user.name,
        action: 'cadastro_paciente', patient_name: clean(formData.nome),
        cpf: digits(formData.cpf), status: 'error', details: apiMsg,
      });
      return res.status(422).json({ error: apiMsg });
    }

    const cdc = result?.dados?.pacienteId || result?.dados?.id || null;

    db.logs.create({
      user_id: req.user.id, user_name: req.user.name,
      action: 'cadastro_paciente', patient_name: clean(formData.nome),
      cpf: digits(formData.cpf), cdc: cdc?.toString() || '',
      status: 'success', details: JSON.stringify(result).substring(0, 500),
    });

    res.json({ success: true, cdc, raw: result });
  } catch (err) {
    db.logs.create({
      user_id: req.user.id, user_name: req.user.name,
      action: 'cadastro_paciente', patient_name: clean(formData?.nome),
      cpf: digits(formData?.cpf), status: 'error',
      details: err.message.substring(0, 500),
    });
    res.status(500).json({ error: 'Erro ao cadastrar paciente', details: err.message });
  }
});

// ── Admin: usuários ───────────────────────────────────────────────────────────

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(db.users.getAll().map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at
  })));
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  try {
    const user = db.users.create(name, email.toLowerCase().trim(), bcrypt.hashSync(password, 10), role || 'user');
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (e) {
    res.status(400).json({ error: e.message === 'EMAIL_EXISTS' ? 'Email já cadastrado' : 'Erro ao criar usuário' });
  }
});

app.patch('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
  db.users.updatePassword(req.params.id, bcrypt.hashSync(password, 10));
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
  }
  db.users.delete(req.params.id);
  res.json({ success: true });
});

// ── Admin: logs ───────────────────────────────────────────────────────────────

app.get('/api/admin/logs', requireAdmin, (req, res) => {
  res.json(db.logs.getAll(req.query));
});

// ── Páginas HTML ──────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─────────────────────────────────────────────────────────────────────────────

initDb();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Climep Chat rodando na porta ${PORT}`));
