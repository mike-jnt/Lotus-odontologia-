import {
  db,
  auth,
  serverTimestamp,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from './firebase.js';

(() => {
  'use strict';

  const loginView = document.getElementById('admin-login');
  const appView = document.getElementById('admin-app');
  const loginForm = document.getElementById('admin-login-form');
  const loginStatus = document.getElementById('admin-login-status');
  const userLabel = document.getElementById('admin-user-label');
  const tbody = document.getElementById('appointments-body');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search');
  const statusFilter = document.getElementById('status-filter');
  const professionalFilter = document.getElementById('professional-filter');
  const detailDialog = document.getElementById('appointment-detail');
  const detailNotes = document.getElementById('detail-notes');
  let appointments = [];
  let selectedAppointmentId = null;
  let unsubscribeAppointments = null;
  let pendingLoginMessage = '';
  let pendingLoginType = 'error';

  loginForm.addEventListener('submit', handleLogin);
  document.getElementById('logout').addEventListener('click', () => signOut(auth));
  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  professionalFilter.addEventListener('change', render);
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('save-detail-notes').addEventListener('click', saveInternalNotes);
  detailDialog.querySelector('.modal-close').addEventListener('click', () => detailDialog.close());
  detailDialog.addEventListener('click', event => {
    if (event.target === detailDialog) detailDialog.close();
  });

  onAuthStateChanged(auth, async user => {
    stopAppointmentsListener();
    appointments = [];

    if (!user) {
      showLogin(pendingLoginMessage, pendingLoginType);
      pendingLoginMessage = '';
      pendingLoginType = 'error';
      return;
    }

    try {
      const accessRef = doc(db, 'settings', 'adminAccess');
      let accessSnap = await getDoc(accessRef);

      // Bootstrap sin verificación de correo:
      // Firebase Authentication ya validó que el correo/contraseña pertenecen
      // a una cuenta registrada. El primer usuario autenticado que entra cuando
      // aún no existe settings/adminAccess queda fijado como owner.
      if (!accessSnap.exists()) {
        try {
          await setDoc(accessRef, {
            ownerUid: user.uid,
            ownerEmail: user.email || '',
            ownerName: user.displayName || 'Administrador principal',
            role: 'owner',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (bootstrapError) {
          // Si otra sesión creó el owner entre la lectura y la escritura,
          // las reglas rechazarán este intento y se volverá a leer el propietario real.
          console.warn('El administrador principal pudo haber sido registrado por otra sesión:', bootstrapError);
        }
        accessSnap = await getDoc(accessRef);
      }

      const access = accessSnap.exists() ? accessSnap.data() : null;
      const isOwner = Boolean(access && access.active === true && access.ownerUid === user.uid);

      let roleLabel = '';
      let displayName = user.displayName || user.email || 'Administrador';

      if (isOwner) {
        roleLabel = 'Administrador principal';
        displayName = access.ownerName || user.displayName || user.email || 'Administrador principal';

        // Firestore no crea colecciones vacías. En el primer acceso del owner,
        // creamos admins/{uid}; con ese documento nace la colección "admins".
        const ownerAdminRef = doc(db, 'admins', user.uid);
        const ownerAdminSnap = await getDoc(ownerAdminRef);
        if (!ownerAdminSnap.exists()) {
          await setDoc(ownerAdminRef, {
            email: user.email || '',
            name: displayName,
            role: 'owner',
            active: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } else {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        const adminData = adminSnap.exists() ? adminSnap.data() : null;

        if (!adminData || adminData.active !== true || !['admin', 'reception'].includes(adminData.role)) {
          pendingLoginMessage = 'El correo y la contraseña son válidos, pero este usuario no está autorizado para administrar Lotus.';
          pendingLoginType = 'error';
          await signOut(auth);
          return;
        }

        roleLabel = adminData.role === 'reception' ? 'Recepción' : 'Administrador';
        displayName = adminData.name || user.displayName || user.email || roleLabel;
      }

      userLabel.textContent = displayName;
      const roleElement = document.getElementById('admin-role-label');
      if (roleElement) roleElement.textContent = `${roleLabel} · ${user.email || ''}`;

      showApp();
      listenAppointments();
    } catch (error) {
      console.error(error);
      pendingLoginMessage = 'No fue posible validar los permisos administrativos. Revisa las reglas de Firestore.';
      pendingLoginType = 'error';
      await signOut(auth).catch(() => {});
    }
  });

  async function handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const button = loginForm.querySelector('button[type="submit"]');

    loginStatus.textContent = '';
    button.disabled = true;
    button.textContent = 'Ingresando…';

    try {
      await signInWithEmailAndPassword(auth, email, password);
      loginForm.reset();
    } catch (error) {
      console.error(error);
      loginStatus.textContent = humanAuthError(error.code);
      loginStatus.className = 'form-status error';
    } finally {
      button.disabled = false;
      button.textContent = 'Ingresar al panel';
    }
  }

  function listenAppointments() {
    const appointmentsQuery = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'));
    unsubscribeAppointments = onSnapshot(appointmentsQuery, snapshot => {
      appointments = snapshot.docs.map(snapshotDoc => ({
        firestoreId: snapshotDoc.id,
        ...snapshotDoc.data()
      }));
      render();
    }, error => {
      console.error('Error leyendo citas:', error);
      emptyState.style.display = 'block';
      emptyState.innerHTML = '<h2>No pudimos cargar la agenda</h2><p>Verifica las reglas de Firestore y la conexión a internet.</p>';
    });
  }

  function stopAppointmentsListener() {
    if (typeof unsubscribeAppointments === 'function') unsubscribeAppointments();
    unsubscribeAppointments = null;
  }

  function render() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const professional = professionalFilter.value;
    const filtered = appointments
      .filter(item => !status || item.status === status)
      .filter(item => !professional || item.professional === professional)
      .filter(item => !term || [item.code, item.name, item.phone, item.email, item.service, item.professional].join(' ').toLowerCase().includes(term))
      .sort(compareAppointmentDate);

    tbody.innerHTML = '';
    emptyState.style.display = filtered.length ? 'none' : 'block';
    document.querySelector('.appointments-table').style.display = filtered.length ? 'table' : 'none';

    filtered.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="date-cell"><strong>${escapeHTML(formatDate(item.date))}</strong><small>${escapeHTML(formatTime(item.time))}</small></td>
        <td class="patient-cell"><strong>${escapeHTML(item.name || '')}</strong><small>${escapeHTML(item.patientType || '')}</small></td>
        <td>${escapeHTML(item.service || '')}<br><small>${escapeHTML(item.professional || '')}</small></td>
        <td>${escapeHTML(item.phone || '')}<br><small>${escapeHTML(item.email || 'Sin correo')}</small></td>
        <td><small>${escapeHTML(formatTimestamp(item.createdAt))}</small></td>
        <td><select class="status-select" data-id="${escapeHTML(item.firestoreId)}">${statusOptions(item.status)}</select></td>
        <td><div class="row-actions"><button class="icon-button view" data-id="${escapeHTML(item.firestoreId)}" title="Ver detalle">Ver</button></div></td>`;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', async () => {
        select.disabled = true;
        await updateStatus(select.dataset.id, select.value);
        select.disabled = false;
      });
    });
    tbody.querySelectorAll('.view').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id)));

    updateStats();
  }

  function showDetail(firestoreId) {
    const item = appointments.find(entry => entry.firestoreId === firestoreId);
    if (!item) return;
    selectedAppointmentId = firestoreId;
    document.getElementById('detail-name').textContent = item.name || 'Paciente';
    document.getElementById('detail-content').innerHTML = `
      <div class="detail-grid">
        <div><span>Código</span><strong>${escapeHTML(item.code || item.firestoreId)}</strong></div>
        <div><span>Estado</span><strong>${escapeHTML(item.status || 'Pendiente')}</strong></div>
        <div><span>Fecha y hora de la cita</span><strong>${escapeHTML(formatDate(item.date))} · ${escapeHTML(formatTime(item.time))}</strong></div>
        <div><span>Solicitud registrada</span><strong>${escapeHTML(formatTimestamp(item.createdAt))}</strong></div>
        <div><span>Última actualización</span><strong>${escapeHTML(formatTimestamp(item.updatedAt))}</strong></div>
        <div><span>Tipo de paciente</span><strong>${escapeHTML(item.patientType || '')}</strong></div>
        <div><span>Servicio</span><strong>${escapeHTML(item.service || '')}</strong></div>
        <div><span>Profesional</span><strong>${escapeHTML(item.professional || '')}</strong></div>
        <div><span>WhatsApp</span><strong>${escapeHTML(item.phone || '')}</strong></div>
        <div><span>Correo</span><strong>${escapeHTML(item.email || 'No registrado')}</strong></div>
        <div><span>Origen</span><strong>${escapeHTML(item.source === 'web' ? 'Página web' : (item.source || 'No registrado'))}</strong></div>
        <div><span>Zona horaria</span><strong>${escapeHTML(item.timezone || 'America/Bogota')}</strong></div>
      </div>
      <div class="detail-reason"><strong>Motivo de consulta</strong><p>${escapeHTML(item.reason || 'Sin observaciones')}</p></div>`;
    detailNotes.value = item.internalNotes || '';
    detailDialog.showModal();
  }

  async function updateStatus(firestoreId, value) {
    try {
      await updateDoc(doc(db, 'appointments', firestoreId), {
        status: value,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin'
      });
    } catch (error) {
      console.error('Error actualizando estado:', error);
      alert('No fue posible actualizar el estado de la cita.');
    }
  }

  async function saveInternalNotes() {
    if (!selectedAppointmentId) return;
    const button = document.getElementById('save-detail-notes');
    button.disabled = true;
    button.textContent = 'Guardando…';
    try {
      await updateDoc(doc(db, 'appointments', selectedAppointmentId), {
        internalNotes: String(detailNotes.value || '').trim().slice(0, 1500),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.email || auth.currentUser?.uid || 'admin'
      });
      button.textContent = 'Guardado';
      setTimeout(() => { button.textContent = 'Guardar nota'; }, 1200);
    } catch (error) {
      console.error(error);
      button.textContent = 'Guardar nota';
      alert('No fue posible guardar la nota interna.');
    } finally {
      button.disabled = false;
    }
  }

  function updateStats() {
    const today = dateKey(new Date());
    document.getElementById('stat-total').textContent = appointments.length;
    document.getElementById('stat-pending').textContent = appointments.filter(a => a.status === 'Pendiente').length;
    document.getElementById('stat-confirmed').textContent = appointments.filter(a => a.status === 'Confirmada').length;
    document.getElementById('stat-today').textContent = appointments.filter(a => a.date === today).length;
  }

  function exportCSV() {
    if (!appointments.length) {
      alert('No hay solicitudes para exportar.');
      return;
    }
    const headers = ['Código','Registrada','Fecha cita','Hora','Paciente','Tipo','Servicio','Profesional','WhatsApp','Correo','Motivo','Estado','Notas internas','Última actualización'];
    const rows = appointments.map(a => [
      a.code || a.firestoreId,
      formatTimestamp(a.createdAt),
      a.date,
      a.time,
      a.name,
      a.patientType,
      a.service,
      a.professional,
      a.phone,
      a.email,
      a.reason,
      a.status,
      a.internalNotes,
      formatTimestamp(a.updatedAt)
    ]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda-lotus-${dateKey(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function showLogin(message = '', type = 'error') {
    loginView.hidden = false;
    appView.hidden = true;
    userLabel.textContent = '';
    if (message) {
      loginStatus.textContent = message;
      loginStatus.className = `form-status ${type}`;
    } else {
      loginStatus.textContent = '';
      loginStatus.className = 'form-status';
    }
  }

  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    loginStatus.textContent = '';
  }

  function humanAuthError(code) {
    const messages = {
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/invalid-email': 'El correo electrónico no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Inténtalo nuevamente más tarde.',
      'auth/network-request-failed': 'No hay conexión con Firebase. Revisa tu internet.'
    };
    return messages[code] || 'No fue posible iniciar sesión.';
  }

  function statusOptions(current) {
    return ['Pendiente','Confirmada','Reprogramada','En atención','Finalizada','Cancelada','No asistió']
      .map(value => `<option${value === current ? ' selected' : ''}>${value}</option>`).join('');
  }

  function compareAppointmentDate(a, b) {
    return `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`);
  }

  function formatDate(value) {
    if (!value) return 'Sin fecha';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function formatTime(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return value || 'Sin hora';
    const [hour, minute] = value.split(':').map(Number);
    return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, hour, minute));
  }

  function formatTimestamp(value) {
    if (!value) return 'Pendiente de sincronización';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin registro';
    return new Intl.DateTimeFormat('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota'
    }).format(date);
  }

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function csvCell(value) {
    const text = String(value ?? '').replace(/"/g, '""');
    return `"${text}"`;
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  }
})();
