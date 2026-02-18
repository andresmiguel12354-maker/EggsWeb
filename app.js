// ════════════════════════════════════════════════════════════════
//  app.js — EggsWeb con Supabase
//  Reemplaza SUPABASE_URL y SUPABASE_ANON_KEY con tus valores reales
//  Tablas necesarias: ver supabase_schema.sql
// ════════════════════════════════════════════════════════════════

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ── CONFIGURACIÓN ─────────────────────────────────────────────
const SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';        // ← reemplaza
const SUPABASE_ANON_KEY = 'TU_ANON_KEY_AQUI';                       // ← reemplaza

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── ESTADO GLOBAL ─────────────────────────────────────────────
let ME = null;          // usuario logueado (perfil de la tabla profiles)
let SB_SESSION = null;  // sesión de Supabase Auth

// ════════════════════════════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════════════════════════════
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(m) {
  const t = document.getElementById('toast');
  t.textContent = m; t.style.display = 'block';
  clearTimeout(window._tt);
  window._tt = setTimeout(() => t.style.display = 'none', 2800);
}

function showLoading(msg = 'Cargando...') {
  document.getElementById('loading-overlay').classList.add('on');
  document.querySelector('#loading-overlay p').textContent = msg;
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.remove('on');
}

function avatarUrl(profile) {
  if (profile?.avatar_url) return profile.avatar_url;
  const ini = ((profile?.name||'U')[0] + (profile?.lastname||'')[0]).toUpperCase();
  return `https://placehold.co/100x100/003399/ffffff?text=${ini}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ════════════════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  showLoading('Conectando...');

  // Verificar sesión activa al cargar — solo una vez
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadMyProfile(session.user.id);
  } else {
    hideLoading();
    showLogin();
    await updatePromoStats();
  }

  // Escuchar solo logout y login nuevos (no el evento inicial)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      ME = null;
      showLogin();
    } else if (event === 'SIGNED_IN' && !ME) {
      await loadMyProfile(session.user.id);
    }
  });
});

async function loadMyProfile(userId) {
  showLoading('Cargando perfil...');
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    hideLoading();
    showLogin();
    showToast('⚠️ Perfil no encontrado. Intenta de nuevo.');
    return;
  }
  ME = data;
  await showApp(ME);
  hideLoading();
}

async function updatePromoStats() {
  const [{ count: uc }, { count: pc }] = await Promise.all([
    sb.from('profiles').select('id', { count: 'exact', head: true }),
    sb.from('posts').select('id', { count: 'exact', head: true })
  ]);
  const pU = document.getElementById('promo-users');
  const pP = document.getElementById('promo-posts');
  if (pU) pU.textContent = uc || 0;
  if (pP) pP.textContent = pc || 0;
}

// ════════════════════════════════════════════════════════════════
//  PAGE SWITCHING
// ════════════════════════════════════════════════════════════════
async function showApp(u) {
  document.getElementById('pg-login').classList.remove('on');
  document.getElementById('pg-app').classList.add('on');
  document.getElementById('hdr-links').style.display  = 'none';
  document.getElementById('hdr-user').style.display   = 'block';
  document.getElementById('nav-login').style.display  = 'none';
  document.getElementById('nav-app').style.display    = 'flex';
  document.title = 'EggsWeb — Inicio';

  document.getElementById('hdr-uname').textContent  = u.name + ' ' + u.lastname;
  document.getElementById('pp-name').textContent    = u.name + ' ' + u.lastname;
  document.getElementById('pp-mood').textContent    = u.bio ? `"${u.bio.slice(0,40)}"` : '✨ "Conectando el mundo"';
  document.getElementById('pp-img').src             = avatarUrl(u);
  document.getElementById('cfg-pic').src            = avatarUrl(u);
  document.getElementById('post-txt').placeholder   = `¿Qué estás pensando, ${u.name}?`;

  // stats sidebar
  const { count: pc } = await sb.from('posts').select('id', { count:'exact', head:true }).eq('author_id', u.id);
  document.getElementById('st-posts').textContent   = pc || 0;
  document.getElementById('st-since').textContent   = u.created_at ? new Date(u.created_at).getFullYear() : '—';
  document.getElementById('st-country').textContent = u.country || '—';

  // config fields
  document.getElementById('cfg-name').value  = u.name    || '';
  document.getElementById('cfg-last').value  = u.lastname || '';
  document.getElementById('cfg-dob').value   = u.dob     || '';
  document.getElementById('cfg-city').value  = u.city    || '';
  document.getElementById('cfg-bio').value   = u.bio     || '';
  document.getElementById('cfg-email').value = u.email   || '';
  document.getElementById('cfg-uname').value = u.username || '';
  if (u.country) {
    const sel = document.getElementById('cfg-country');
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].text === u.country) { sel.selectedIndex = i; break; }
    }
  }

  await Promise.all([
    renderFeed(),
    renderUsersGrid(),
    renderScraps(),
    renderBirthdays()
  ]);
}

function showLogin() {
  document.getElementById('pg-app').classList.remove('on');
  document.getElementById('pg-login').classList.add('on');
  document.getElementById('hdr-links').style.display  = 'block';
  document.getElementById('hdr-user').style.display   = 'none';
  document.getElementById('nav-login').style.display  = 'flex';
  document.getElementById('nav-app').style.display    = 'none';
  document.title = 'EggsWeb — Inicia Sesión';
  updatePromoStats();
}

window.logoClick = () => { if (ME) showApp(ME); };
window.navClick  = (el) => {
  document.querySelectorAll('#nav-app .ntab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
};

// ════════════════════════════════════════════════════════════════
//  AUTH — LOGIN
// ════════════════════════════════════════════════════════════════
window.doLogin = async () => {
  const email = document.getElementById('l-email').value.trim();
  const pass  = document.getElementById('l-pass').value;
  const al    = document.getElementById('login-al');
  al.classList.remove('show');
  if (!email || !pass) { al.textContent = '⚠️ Completa todos los campos.'; al.classList.add('show'); return; }

  const btn = document.getElementById('login-btn');
  btn.textContent = 'Verificando...'; btn.disabled = true;

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });

  btn.textContent = 'Entrar a EggsWeb →'; btn.disabled = false;

  if (error) {
    al.textContent = '✗ ' + (error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
    al.classList.add('show');
  }
  // onAuthStateChange maneja el resto
};

// ── LOGOUT ──
window.doLogout = async () => {
  await sb.auth.signOut();
  ME = null;
  showLogin();
  showToast('¡Hasta luego! Sesión cerrada.');
};

// ── FORGOT ──
window.doForgot = async () => {
  const email = document.getElementById('fg-email').value.trim();
  const al    = document.getElementById('fg-al');
  const ok    = document.getElementById('fg-ok');
  al.classList.remove('show'); ok.classList.remove('show');
  if (!email) { al.textContent = '⚠️ Ingresa tu correo.'; al.classList.add('show'); return; }

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset-password'
  });
  if (error) { al.textContent = '✗ ' + error.message; al.classList.add('show'); return; }
  ok.textContent = '✅ Te enviamos un enlace de recuperación a tu correo. Revisa tu bandeja.';
  ok.classList.add('show');
  document.getElementById('fg-email').value = '';
};

// ════════════════════════════════════════════════════════════════
//  AUTH — REGISTER
// ════════════════════════════════════════════════════════════════
window.switchAuth = (to) => {
  ['login','reg','forgot'].forEach(id => document.getElementById('ap-'+id).classList.remove('on'));
  document.querySelectorAll('.atb .tbtn').forEach(b => b.classList.remove('on'));
  document.getElementById('ap-'+to).classList.add('on');
  if (to === 'login') document.getElementById('atab-login').classList.add('on');
  if (to === 'reg')   { document.getElementById('atab-reg').classList.add('on'); setStep(1); }
  ['login-al','fg-al','fg-ok','reg-al'].forEach(id => {
    const el = document.getElementById(id); if (el) el.classList.remove('show');
  });
};

window.checkPw = (inp) => {
  const v = inp.value;
  document.getElementById('pw-wrap').style.display = 'block';
  document.getElementById('pw-hint').style.display = 'block';
  let s = 0;
  if (v.length >= 8) s++; if (/[A-Z]/.test(v)) s++; if (/[0-9]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
  const lvl = [
    { p:'20%', c:'#cc2200', l:'Muy débil'  },
    { p:'40%', c:'#ee6600', l:'Débil'      },
    { p:'65%', c:'#ccaa00', l:'Aceptable'  },
    { p:'85%', c:'#007722', l:'Fuerte'     },
    { p:'100%',c:'#004400', l:'Muy fuerte' }
  ][Math.min(s, 4)];
  const bar  = document.getElementById('pw-bar');  bar.style.width = lvl.p; bar.style.background = lvl.c;
  const hint = document.getElementById('pw-hint'); hint.textContent = lvl.l; hint.style.color = lvl.c;
};

window.checkUname = async (inp) => {
  const v = inp.value.trim().toLowerCase();
  const s = document.getElementById('uchk');
  if (!v) { s.textContent = ''; return; }
  if (v.length < 3) { s.style.color='#cc4400'; s.textContent='Mínimo 3 caracteres'; return; }
  if (!/^[a-z0-9._]+$/.test(v)) { s.style.color='#cc4400'; s.textContent='Solo letras, números, puntos y guiones bajos'; return; }
  const reserved = ['admin','eggsweb','root','soporte','moderador'];
  if (reserved.includes(v)) { s.style.color='#cc2200'; s.textContent='✗ No disponible'; return; }
  const { count } = await sb.from('profiles').select('id', { count:'exact', head:true }).eq('username', v);
  s.style.color   = count > 0 ? '#cc2200' : '#007722';
  s.textContent   = count > 0 ? '✗ No disponible' : '✓ Disponible';
};

function showRegAlert(m) {
  const a = document.getElementById('reg-al');
  a.textContent = m; a.classList.add('show');
  setTimeout(() => a.classList.remove('show'), 3500);
}

window.setStep = (n) => {
  document.querySelectorAll('.rstep').forEach(s => s.classList.remove('on'));
  document.getElementById('rs'+n).classList.add('on');
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('si'+i);
    el.classList.remove('on','done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('on');
  }
};

// step local validation (sin guardar aún)
window.regNext = async (step) => {
  document.getElementById('reg-al').classList.remove('show');

  if (step === 1) {
    if (!document.getElementById('r-name').value.trim())    { showRegAlert('⚠️ Ingresa tu nombre.'); return; }
    if (!document.getElementById('r-last').value.trim())    { showRegAlert('⚠️ Ingresa tu apellido.'); return; }
    if (!document.getElementById('r-dob').value)            { showRegAlert('⚠️ Selecciona tu fecha de nacimiento.'); return; }
    if (!document.getElementById('r-country').value)        { showRegAlert('⚠️ Selecciona tu país.'); return; }
    setStep(2);

  } else if (step === 2) {
    const email = document.getElementById('r-email').value.trim();
    const uname = document.getElementById('r-uname').value.trim().toLowerCase();
    const pass  = document.getElementById('r-pass').value;
    const pass2 = document.getElementById('r-pass2').value;

    if (!email || !email.includes('@'))  { showRegAlert('⚠️ Correo inválido.'); return; }
    if (!uname || uname.length < 3)     { showRegAlert('⚠️ Usuario de mínimo 3 caracteres.'); return; }
    if (pass.length < 8)                { showRegAlert('⚠️ Contraseña de mínimo 8 caracteres.'); return; }
    if (pass !== pass2)                 { showRegAlert('⚠️ Las contraseñas no coinciden.'); return; }
    if (!document.getElementById('terms').checked) { showRegAlert('⚠️ Acepta los Términos de Servicio.'); return; }

    // verificar username único
    const { count } = await sb.from('profiles').select('id', { count:'exact', head:true }).eq('username', uname);
    if (count > 0) { showRegAlert('⚠️ Ese usuario ya está en uso.'); return; }

    // crear cuenta en Supabase Auth
    showLoading('Creando cuenta...');
    const { data, error } = await sb.auth.signUp({
      email,
      password: pass,
      options: {
        data: { // metadata inicial (se copia al trigger en la DB)
          name:     document.getElementById('r-name').value.trim(),
          lastname: document.getElementById('r-last').value.trim(),
          username: uname,
          dob:      document.getElementById('r-dob').value,
          country:  document.getElementById('r-country').value,
          gender:   document.getElementById('r-gender').value,
          hint:     document.getElementById('r-hint').value.trim()
        }
      }
    });
    hideLoading();

    if (error) { showRegAlert('✗ ' + error.message); return; }

    // El trigger de Supabase (handle_new_user) crea el registro en profiles automáticamente
    setStep(3);
    document.getElementById('l-email').value = email;
  }
};

// ════════════════════════════════════════════════════════════════
//  FEED — POSTS
// ════════════════════════════════════════════════════════════════
let pendingFile = null, pendingType = null;

window.prevMedia = (e, type) => {
  const f = e.target.files[0]; if (!f) return;
  pendingFile = f; pendingType = type;
  const url = URL.createObjectURL(f);
  const pr  = document.getElementById('media-prev');
  if      (type === 'image') pr.innerHTML = `<img src="${url}" style="max-height:110px;border:1px solid #99aacc;border-radius:2px;display:block;"><span style="font-size:10px;color:#669;display:block;margin-top:2px;">📎 ${f.name}</span>`;
  else if (type === 'video') pr.innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:110px;"></video><span style="font-size:10px;color:#669;display:block;">🎬 ${f.name}</span>`;
  else                       pr.innerHTML = `<audio src="${url}" controls style="width:100%;margin-top:4px;"></audio><span style="font-size:10px;color:#669;display:block;margin-top:2px;">🎵 ${f.name}</span>`;
};

window.publishPost = async () => {
  const text = document.getElementById('post-txt').value.trim();
  if (!text && !pendingFile) { showToast('⚠️ Escribe algo o adjunta un archivo'); return; }
  if (!ME) { showToast('⚠️ Debes iniciar sesión'); return; }

  showLoading('Publicando...');

  let mediaUrl  = null;
  let mediaType = null;

  // subir archivo a Supabase Storage
  if (pendingFile) {
    const ext  = pendingFile.name.split('.').pop();
    const path = `posts/${ME.id}/${Date.now()}.${ext}`;
    const { data: up, error: upErr } = await sb.storage
      .from('media')
      .upload(path, pendingFile, { cacheControl: '3600', upsert: false });

    if (upErr) { hideLoading(); showToast('Error subiendo archivo: ' + upErr.message); return; }

    const { data: { publicUrl } } = sb.storage.from('media').getPublicUrl(path);
    mediaUrl  = publicUrl;
    mediaType = pendingType;
  }

  const { data: post, error } = await sb.from('posts').insert({
    author_id:  ME.id,
    text:       text || null,
    media_url:  mediaUrl,
    media_type: mediaType
  }).select('*, profiles(name,lastname,avatar_url)').single();

  hideLoading();

  if (error) { showToast('Error al publicar: ' + error.message); return; }

  // insertar al inicio del feed en el DOM
  const feed = document.getElementById('feed');
  const emptyEl = feed.querySelector('.empty-feed');
  if (emptyEl) emptyEl.remove();
  feed.insertAdjacentHTML('afterbegin', buildPostHTML(post, []));

  document.getElementById('post-txt').value = '';
  document.getElementById('media-prev').innerHTML = '';
  pendingFile = null; pendingType = null;

  // actualizar contador
  const pc = await sb.from('posts').select('id', { count:'exact', head:true }).eq('author_id', ME.id);
  document.getElementById('st-posts').textContent = pc.count || 0;

  showToast('✅ Publicación enviada');
};

async function renderFeed() {
  const feed = document.getElementById('feed');
  feed.innerHTML = '<div class="empty-feed"><div class="ico">⏳</div><div>Cargando publicaciones...</div></div>';

  const { data: posts, error } = await sb
    .from('posts')
    .select(`
      *,
      profiles ( name, lastname, avatar_url, username ),
      likes ( user_id ),
      comments ( id, text, created_at, profiles ( name, lastname ) )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { feed.innerHTML = '<div class="empty-feed"><div class="ico">⚠️</div><div>Error cargando posts</div></div>'; return; }
  if (!posts || posts.length === 0) {
    feed.innerHTML = '<div class="empty-feed"><div class="ico">📭</div><div>No hay publicaciones aún.</div><div style="font-size:11px;margin-top:4px;color:#aab;">¡Sé el primero en publicar algo!</div></div>';
    return;
  }

  feed.innerHTML = posts.map(p => buildPostHTML(p, p.likes || [])).join('');
}

function buildPostHTML(p, likes) {
  const profile   = p.profiles || {};
  const fullName  = (profile.name || '') + ' ' + (profile.lastname || '');
  const ini       = ((profile.name||'U')[0] + (profile.lastname||'')[0]).toUpperCase();
  const pic       = profile.avatar_url || `https://placehold.co/36x36/003399/ffffff?text=${ini}`;
  const likedByMe = ME && (likes || []).some(l => l.user_id === ME.id);
  const likeCount = (likes || []).length;
  const isOwn     = ME && p.author_id === ME.id;

  let mediaHtml = '';
  if      (p.media_type === 'image') mediaHtml = `<div class="pmedia"><img src="${esc(p.media_url)}" onclick="viewImg(this.src)" alt="imagen"></div>`;
  else if (p.media_type === 'video') mediaHtml = `<div class="pmedia"><video src="${esc(p.media_url)}" controls style="max-width:100%;"></video></div>`;
  else if (p.media_type === 'audio') mediaHtml = `<div class="pmedia"><audio src="${esc(p.media_url)}" controls style="width:100%;"></audio></div>`;

  const cmtCount = (p.comments || []).length;
  const cmtsHtml = (p.comments || []).map(c => `
    <div class="cmt">
      <span class="cmt-who">${esc((c.profiles?.name||''))} ${esc((c.profiles?.lastname||''))}:</span>
      ${esc(c.text)}
      <span style="color:#bbb;font-size:9px;">${fmtDate(c.created_at)}</span>
    </div>`).join('');

  const delBtn = isOwn ? `<span class="pa" onclick="deletePost('${p.id}')" style="color:#cc0000;">🗑️ Eliminar</span>` : '';

  return `
  <div class="post" id="post-${p.id}">
    <div class="ph">
      <img class="pavt" src="${pic}" alt="">
      <div class="pmeta">
        <div class="pauth">${esc(fullName.trim())}</div>
        <div class="ptm">${fmtDate(p.created_at)}</div>
      </div>
    </div>
    ${p.text ? `<div class="ptxt">${esc(p.text)}</div>` : ''}
    ${mediaHtml}
    <div class="pbar">
      <span class="pa ${likedByMe?'liked':''}" id="like-btn-${p.id}" onclick="likePost('${p.id}')">
        ${likedByMe ? '💔 Quitar like' : '👍 Me gusta'} (${likeCount})
      </span>
      <span class="pa" onclick="toggleCmt('${p.id}')">💬 Comentar (<span id="cmt-cnt-${p.id}">${cmtCount}</span>)</span>
      <span class="pa" onclick="openShare('${p.id}')">🔗 Compartir</span>
      ${delBtn}
    </div>
    <div class="cmt-wrap" id="cw-${p.id}">
      <div class="cmt-list" id="cl-${p.id}">
        ${cmtsHtml || '<p style="font-size:10px;color:#aab;padding:2px 0;">Sin comentarios aún. ¡Sé el primero!</p>'}
      </div>
      <div class="cmt-inp">
        <input type="text" id="ci-${p.id}" placeholder="Escribe un comentario..." onkeydown="if(event.key==='Enter')submitCmt('${p.id}')">
        <button class="btn b-bl" style="font-size:10px;padding:2px 8px;" onclick="submitCmt('${p.id}')">Enviar</button>
      </div>
    </div>
  </div>`;
}

// ── LIKES ──
window.likePost = async (postId) => {
  if (!ME) { showToast('⚠️ Inicia sesión para dar like'); return; }

  const btn = document.getElementById('like-btn-' + postId);
  const liked = btn.classList.contains('liked');

  if (liked) {
    await sb.from('likes').delete().eq('post_id', postId).eq('user_id', ME.id);
  } else {
    await sb.from('likes').insert({ post_id: postId, user_id: ME.id });
  }

  // actualizar UI
  const { count } = await sb.from('likes').select('id', { count:'exact', head:true }).eq('post_id', postId);
  btn.classList.toggle('liked', !liked);
  btn.innerHTML = `${!liked ? '💔 Quitar like' : '👍 Me gusta'} (${count || 0})`;
  btn.onclick = () => window.likePost(postId);
};

// ── COMENTARIOS ──
window.toggleCmt = (postId) => {
  const cw = document.getElementById('cw-' + postId);
  if (!cw) return;
  const open = cw.classList.toggle('open');
  if (open) document.getElementById('ci-' + postId)?.focus();
};

window.submitCmt = async (postId) => {
  if (!ME) { showToast('⚠️ Inicia sesión para comentar'); return; }
  const inp  = document.getElementById('ci-' + postId);
  const text = inp.value.trim();
  if (!text) return;

  const { data: cmt, error } = await sb.from('comments').insert({
    post_id:   postId,
    author_id: ME.id,
    text
  }).select('id, text, created_at').single();

  if (error) { showToast('Error al comentar: ' + error.message); return; }

  // update DOM
  const cl = document.getElementById('cl-' + postId);
  if (cl) {
    const placeholder = cl.querySelector('p');
    if (placeholder) placeholder.remove();
    cl.insertAdjacentHTML('beforeend', `
      <div class="cmt">
        <span class="cmt-who">${esc(ME.name)} ${esc(ME.lastname)}:</span>
        ${esc(text)}
        <span style="color:#bbb;font-size:9px;">${fmtDate(cmt.created_at)}</span>
      </div>`);
  }
  const cnt = document.getElementById('cmt-cnt-' + postId);
  if (cnt) cnt.textContent = parseInt(cnt.textContent || '0') + 1;
  inp.value = '';
  showToast('💬 Comentario publicado');
};

// ── ELIMINAR POST ──
window.deletePost = async (postId) => {
  if (!confirm('¿Eliminar esta publicación?')) return;
  const { error } = await sb.from('posts').delete().eq('id', postId).eq('author_id', ME.id);
  if (error) { showToast('Error: ' + error.message); return; }
  const el = document.getElementById('post-' + postId);
  if (el) el.remove();
  if (!document.querySelector('.post')) renderFeed();
  showToast('🗑️ Publicación eliminada');
};

// ════════════════════════════════════════════════════════════════
//  SHARE
// ════════════════════════════════════════════════════════════════
let currentSharePostId = null;

window.openShare = (postId) => {
  currentSharePostId = postId;
  const url = window.location.href.split('#')[0] + '#post-' + postId;
  document.getElementById('share-url').value = url;
  openMod('mod-share');
};

window.copyShareUrl = () => {
  const inp = document.getElementById('share-url');
  inp.select();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(inp.value).then(() => showToast('🔗 Enlace copiado al portapapeles'));
  } else {
    document.execCommand('copy');
    showToast('🔗 Enlace copiado');
  }
};

async function getShareData() {
  const url = document.getElementById('share-url').value;
  const { data: p } = await sb.from('posts').select('text, profiles(name,lastname)').eq('id', currentSharePostId).single();
  const txt = p ? `${p.profiles?.name} publicó en EggsWeb: "${(p.text||'').slice(0,80)}..."` : 'Mira esto en EggsWeb';
  return { url, txt };
}

window.shareWA = async () => { const { url, txt } = await getShareData(); window.open('https://wa.me/?text='+encodeURIComponent(txt+' '+url),'_blank'); };
window.shareTW = async () => { const { url, txt } = await getShareData(); window.open('https://twitter.com/intent/tweet?text='+encodeURIComponent(txt)+'&url='+encodeURIComponent(url),'_blank'); };
window.shareFB = async () => { const { url }      = await getShareData(); window.open('https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url),'_blank'); };
window.shareTG = async () => { const { url, txt } = await getShareData(); window.open('https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent(txt),'_blank'); };

// ════════════════════════════════════════════════════════════════
//  USUARIOS / FRIENDS
// ════════════════════════════════════════════════════════════════
async function renderUsersGrid() {
  const grid = document.getElementById('users-grid');
  const { data: users } = await sb.from('profiles').select('id,name,lastname,avatar_url,username').neq('id', ME?.id).limit(6);
  if (!users || users.length === 0) { grid.innerHTML = '<p style="font-size:11px;color:#999;">Aún no hay otros usuarios.</p>'; return; }
  grid.innerHTML = `<div class="fgrd">${users.map(u => `
    <div class="fcard" onclick="openMsgTo('${esc(u.name+' '+u.lastname)}')">
      <img src="${avatarUrl(u)}" alt="">
      <span>${esc(u.name)} ${esc(u.lastname[0]||'')}.</span>
    </div>`).join('')}</div>`;
}

window.renderAllUsersList = async () => {
  const el = document.getElementById('all-users-list');
  el.innerHTML = '<p style="font-size:11px;color:#999;">Cargando...</p>';
  const { data: users } = await sb.from('profiles').select('id,name,lastname,avatar_url,username,country').neq('id', ME?.id);
  if (!users || users.length === 0) { el.innerHTML = '<p style="font-size:11px;color:#999;">Aún no hay otros usuarios.</p>'; return; }
  el.innerHTML = users.map(u => `
    <div class="ri">
      <img src="${avatarUrl(u)}" alt="">
      <span class="rn">${esc(u.name)} ${esc(u.lastname)} <span style="color:#999;font-weight:normal;">@${u.username||''}</span>${u.country ? ` · <span style="color:#aaa;">${u.country}</span>` : ''}</span>
      <button class="btn b-bl" style="font-size:10px;padding:2px 6px;" onclick="openMsgTo('${esc(u.name+' '+u.lastname)}')">✉️ Mensaje</button>
    </div>`).join('');
};

window.searchUser = async () => {
  const q   = document.getElementById('search-inp').value.trim();
  const res = document.getElementById('search-res');
  if (!q) { res.innerHTML = ''; return; }
  const { data: users } = await sb.from('profiles').select('id,name,lastname,avatar_url,username,country')
    .neq('id', ME?.id)
    .or(`name.ilike.%${q}%,lastname.ilike.%${q}%,username.ilike.%${q}%`);

  if (!users || users.length === 0) { res.innerHTML = '<p style="font-size:11px;color:#999;">No se encontraron usuarios.</p>'; return; }
  res.innerHTML = users.map(u => `
    <div class="ri">
      <img src="${avatarUrl(u)}" alt="">
      <span class="rn">${esc(u.name)} ${esc(u.lastname)} <span style="color:#999;">@${u.username||''}</span></span>
      <button class="btn b-bl" style="font-size:10px;padding:2px 6px;" onclick="openMsgTo('${esc(u.name+' '+u.lastname)}')">✉️ Mensaje</button>
    </div>`).join('');
};
document.getElementById('search-inp')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.searchUser(); });

// ════════════════════════════════════════════════════════════════
//  BIRTHDAYS
// ════════════════════════════════════════════════════════════════
async function renderBirthdays() {
  const today  = new Date();
  const mmdd   = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  // Supabase: filtrar por mes-dia del campo dob (formato YYYY-MM-DD)
  const { data: users } = await sb.from('profiles').select('name,lastname').filter('dob', 'like', `%-${mmdd}`);
  const panel = document.getElementById('bday-panel');
  if (!users || users.length === 0) { panel.innerHTML = '<p style="font-size:11px;color:#999;">Sin cumpleaños hoy.</p>'; return; }
  panel.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:5px;padding:3px 0;">
      <span>🎂</span>
      <span style="font-size:11px;color:var(--link);font-weight:bold;">${esc(u.name)} ${esc(u.lastname)}</span>
      <span style="font-size:10px;color:#999;">¡Hoy!</span>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════════
//  SCRAP
// ════════════════════════════════════════════════════════════════
window.addScrap = async () => {
  const txt = document.getElementById('scrap-txt').value.trim();
  if (!txt) return;
  const { error } = await sb.from('scraps').insert({ author_id: ME.id, text: txt });
  if (error) { showToast('Error: ' + error.message); return; }
  document.getElementById('scrap-txt').value = '';
  await renderScraps();
  showToast('📌 Scrap publicado');
};

async function renderScraps() {
  const list = document.getElementById('scrap-list');
  const { data: scraps } = await sb.from('scraps')
    .select('text, created_at, profiles(name,lastname)')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!scraps || scraps.length === 0) { list.innerHTML = '<p style="font-size:11px;color:#999;">Sin scraps aún.</p>'; return; }
  list.innerHTML = scraps.map(s => `
    <div class="si">
      <span class="sfr">${esc((s.profiles?.name||''))} ${esc((s.profiles?.lastname||''))}</span>
      <div class="stx">${esc(s.text)}</div>
      <div class="stm">${fmtDate(s.created_at)}</div>
    </div>`).join('');
}

// ════════════════════════════════════════════════════════════════
//  MESSAGES (base para implementar con Supabase Realtime)
// ════════════════════════════════════════════════════════════════
window.sendMsg = async () => {
  const to_username = document.getElementById('msg-to').value.trim();
  const body        = document.getElementById('msg-bdy').value.trim();
  if (!to_username || !body) { showToast('⚠️ Completa los campos Para y Mensaje'); return; }

  // buscar usuario destinatario
  const { data: recipient } = await sb.from('profiles').select('id').eq('username', to_username).single();
  if (!recipient) { showToast(`✗ No existe el usuario @${to_username}`); return; }

  const { error } = await sb.from('messages').insert({
    from_id: ME.id,
    to_id:   recipient.id,
    subject: document.getElementById('msg-sbj').value.trim() || '(sin asunto)',
    body
  });

  if (error) { showToast('Error: ' + error.message); return; }

  document.getElementById('msg-to').value  = '';
  document.getElementById('msg-sbj').value = '';
  document.getElementById('msg-bdy').value = '';
  closeMod('mod-msg');
  showToast(`📤 Mensaje enviado a @${to_username}`);
};

window.openMsgTo = (name) => {
  closeMod('mod-amigos');
  openMod('mod-msg');
  const tabs = document.querySelectorAll('#mod-msg .tbtn');
  tabs.forEach(t => t.classList.remove('on'));
  tabs[2].classList.add('on');
  document.querySelectorAll('#mod-msg .tc').forEach(t => t.classList.remove('on'));
  document.getElementById('tm3').classList.add('on');
  document.getElementById('msg-to').value = name;
};

// ════════════════════════════════════════════════════════════════
//  CONFIG / PERFIL
// ════════════════════════════════════════════════════════════════
window.saveConfig = async () => {
  if (!ME) return;
  const updates = {
    name:     document.getElementById('cfg-name').value.trim()  || ME.name,
    lastname: document.getElementById('cfg-last').value.trim()  || ME.lastname,
    dob:      document.getElementById('cfg-dob').value          || null,
    city:     document.getElementById('cfg-city').value.trim()  || null,
    bio:      document.getElementById('cfg-bio').value.trim()   || null,
    username: document.getElementById('cfg-uname').value.trim() || ME.username,
    country:  document.getElementById('cfg-country').value      || null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await sb.from('profiles').update(updates).eq('id', ME.id).select().single();
  if (error) { showToast('Error: ' + error.message); return; }

  ME = data;
  closeMod('mod-config');
  await showApp(ME);
  showToast('✅ Configuración guardada');
};

window.changePass = async () => {
  const nw   = document.getElementById('cfg-newpass').value;
  const nw2  = document.getElementById('cfg-newpass2').value;
  const al   = document.getElementById('cfg-pass-al');
  al.classList.remove('show');
  if (nw.length < 8) { al.textContent = '⚠️ Mínimo 8 caracteres.'; al.classList.add('show'); return; }
  if (nw !== nw2)    { al.textContent = '⚠️ Las contraseñas no coinciden.'; al.classList.add('show'); return; }

  const { error } = await sb.auth.updateUser({ password: nw });
  if (error) { al.textContent = '✗ ' + error.message; al.classList.add('show'); return; }

  document.getElementById('cfg-curpass').value  = '';
  document.getElementById('cfg-newpass').value  = '';
  document.getElementById('cfg-newpass2').value = '';
  showToast('🔐 Contraseña actualizada');
};

window.deleteAccount = async () => {
  if (!confirm(`⚠️ ¿Eliminar tu cuenta "${ME.name} ${ME.lastname}" de forma permanente?`)) return;
  // Esto requiere función Edge en Supabase para borrar auth.user (ver README)
  showToast('Para eliminar tu cuenta contacta al administrador.');
};

// ── FOTO DE PERFIL ──
window.changePic = (e) => applyPic(e);
window.changePicCfg = (e) => applyPic(e);

async function applyPic(e) {
  const f = e.target.files[0]; if (!f || !ME) return;
  showLoading('Subiendo foto...');

  const ext  = f.name.split('.').pop();
  const path = `avatars/${ME.id}/avatar.${ext}`;

  const { error: upErr } = await sb.storage.from('media').upload(path, f, { upsert: true, cacheControl: '3600' });
  if (upErr) { hideLoading(); showToast('Error: ' + upErr.message); return; }

  const { data: { publicUrl } } = sb.storage.from('media').getPublicUrl(path);

  await sb.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', ME.id);
  ME.avatar_url = publicUrl;

  document.getElementById('pp-img').src  = publicUrl;
  document.getElementById('cfg-pic').src = publicUrl;
  hideLoading();
  showToast('✅ Foto de perfil actualizada');
}

// ── PERFIL MODAL ──
window.renderProfile = async () => {
  if (!ME) return;

  const ini = ((ME.name||'U')[0] + (ME.lastname||'')[0]).toUpperCase();
  document.getElementById('mp-pic').src          = avatarUrl(ME);
  document.getElementById('mp-name').textContent = ME.name + ' ' + ME.lastname;
  document.getElementById('mp-username').textContent = '@' + (ME.username||'—');
  document.getElementById('mp-email').textContent    = ME.email || '—';
  document.getElementById('mp-bio').textContent      = ME.bio ? `"${ME.bio}"` : 'Sin descripción.';
  document.getElementById('mp-country').textContent  = ME.country || '—';
  document.getElementById('mp-city').textContent     = ME.city    || '—';
  document.getElementById('mp-since').textContent    = ME.created_at ? new Date(ME.created_at).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  document.getElementById('mp-dob').textContent      = ME.dob ? new Date(ME.dob+'T12:00:00').toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  const { data: myPosts } = await sb.from('posts').select('id,text,media_type,media_url,created_at,likes(id),comments(id)').eq('author_id', ME.id).order('created_at',{ascending:false}).limit(3);
  const { count: totalPosts } = await sb.from('posts').select('id',{count:'exact',head:true}).eq('author_id', ME.id);
  const { count: totalComments } = await sb.from('comments').select('id',{count:'exact',head:true}).eq('author_id', ME.id);

  // total likes recibidos
  let totalLikes = 0;
  if (myPosts) myPosts.forEach(p => totalLikes += (p.likes||[]).length);

  document.getElementById('mp-posts').textContent          = totalPosts || 0;
  document.getElementById('mp-comments').textContent       = totalComments || 0;
  document.getElementById('mp-likes-received').textContent = totalLikes;
  document.getElementById('mp-lastpost').textContent       = myPosts?.[0] ? fmtDate(myPosts[0].created_at) : 'Sin publicaciones';

  const feed = document.getElementById('mp-feed');
  if (!myPosts || myPosts.length === 0) {
    feed.innerHTML = '<p style="font-size:11px;color:#999;text-align:center;padding:12px 0;">Aún no has publicado nada.</p>';
    return;
  }
  feed.innerHTML = myPosts.map(p => `
    <div style="border:1px solid #dde;border-radius:3px;padding:7px;margin-bottom:6px;background:#fafcff;">
      <div style="font-size:10px;color:#aab;margin-bottom:3px;">🕐 ${fmtDate(p.created_at)}</div>
      ${p.text ? `<div style="font-size:12px;color:#333;white-space:pre-wrap;word-break:break-word;margin-bottom:4px;">${esc(p.text)}</div>` : ''}
      ${p.media_type === 'image' ? `<img src="${esc(p.media_url)}" style="max-height:80px;max-width:100%;border-radius:2px;display:block;margin-bottom:4px;" onclick="viewImg(this.src)">` : ''}
      <div style="font-size:10px;color:#889;display:flex;gap:10px;margin-top:3px;">
        <span>👍 ${(p.likes||[]).length} likes</span>
        <span>💬 ${(p.comments||[]).length} comentarios</span>
      </div>
    </div>`).join('');
};

// ════════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════════
window.openMod = (id) => {
  document.getElementById(id).classList.add('on');
  if (id === 'mod-amigos') window.renderAllUsersList();
  if (id === 'mod-scrap')  renderScraps();
  if (id === 'mod-perfil') window.renderProfile();
};
window.closeMod = (id) => document.getElementById(id).classList.remove('on');
document.querySelectorAll('.ov').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('on'); }));

window.mTab = (modId, tabId, btn) => {
  const mod = document.getElementById(modId);
  mod.querySelectorAll('.tc').forEach(t => t.classList.remove('on'));
  mod.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
  document.getElementById(tabId).classList.add('on');
  btn.classList.add('on');
};

// ════════════════════════════════════════════════════════════════
//  IMAGE VIEWER
// ════════════════════════════════════════════════════════════════
window.viewImg = (src) => { document.getElementById('iv-img').src = src; document.getElementById('iv').classList.add('on'); };
