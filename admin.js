(() => {
  'use strict';

  const tbody = document.getElementById('appointments-body');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search');
  const statusFilter = document.getElementById('status-filter');
  const detailDialog = document.getElementById('appointment-detail');
  let appointments = loadAppointments();

  render();

  searchInput.addEventListener('input', render);
  statusFilter.addEventListener('change', render);
  document.getElementById('export-csv').addEventListener('click', exportCSV);
  document.getElementById('clear-demo').addEventListener('click', () => {
    if (!appointments.length) return;
    if (confirm('¿Deseas eliminar todas las solicitudes almacenadas en este navegador?')) {
      appointments = [];
      saveAppointments();
      render();
    }
  });
  detailDialog.querySelector('.modal-close').addEventListener('click', () => detailDialog.close());
  detailDialog.addEventListener('click', event => {
    if (event.target === detailDialog) detailDialog.close();
  });

  function render() {
    const term = searchInput.value.trim().toLowerCase();
    const status = statusFilter.value;
    const filtered = appointments
      .filter(item => !status || item.status === status)
      .filter(item => !term || [item.name, item.phone, item.email, item.service].join(' ').toLowerCase().includes(term))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

    tbody.innerHTML = '';
    emptyState.style.display = filtered.length ? 'none' : 'block';
    document.querySelector('.appointments-table').style.display = filtered.length ? 'table' : 'none';

    filtered.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="date-cell"><strong>${escapeHTML(formatDate(item.date))}</strong><small>${escapeHTML(item.time || '')}</small></td>
        <td class="patient-cell"><strong>${escapeHTML(item.name || '')}</strong><small>${escapeHTML(item.patientType || '')}</small></td>
        <td>${escapeHTML(item.service || '')}<br><small>${escapeHTML(item.professional || '')}</small></td>
        <td>${escapeHTML(item.phone || '')}<br><small>${escapeHTML(item.email || '')}</small></td>
        <td><select class="status-select" data-id="${escapeHTML(item.id)}">${statusOptions(item.status)}</select></td>
        <td><div class="row-actions"><button class="icon-button view" data-id="${escapeHTML(item.id)}" title="Ver detalle">Ver</button><button class="icon-button delete" data-id="${escapeHTML(item.id)}" title="Eliminar">×</button></div></td>`;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', () => updateStatus(select.dataset.id, select.value));
    });
    tbody.querySelectorAll('.view').forEach(button => button.addEventListener('click', () => showDetail(button.dataset.id)));
    tbody.querySelectorAll('.delete').forEach(button => button.addEventListener('click', () => deleteItem(button.dataset.id)));

    updateStats();
  }

  function showDetail(id) {
    const item = appointments.find(entry => entry.id === id);
    if (!item) return;
    document.getElementById('detail-name').textContent = item.name || 'Paciente';
    document.getElementById('detail-content').innerHTML = `
      <div class="detail-grid">
        <div><span>Código</span><strong>${escapeHTML(item.id)}</strong></div>
        <div><span>Estado</span><strong>${escapeHTML(item.status)}</strong></div>
        <div><span>Fecha</span><strong>${escapeHTML(formatDate(item.date))} · ${escapeHTML(item.time)}</strong></div>
        <div><span>Tipo de paciente</span><strong>${escapeHTML(item.patientType)}</strong></div>
        <div><span>Servicio</span><strong>${escapeHTML(item.service)}</strong></div>
        <div><span>Profesional</span><strong>${escapeHTML(item.professional)}</strong></div>
        <div><span>WhatsApp</span><strong>${escapeHTML(item.phone)}</strong></div>
        <div><span>Correo</span><strong>${escapeHTML(item.email || 'No registrado')}</strong></div>
      </div>
      <div class="detail-reason"><strong>Motivo de consulta</strong><p>${escapeHTML(item.reason || 'Sin observaciones')}</p></div>`;
    detailDialog.showModal();
  }

  function updateStatus(id, value) {
    const item = appointments.find(entry => entry.id === id);
    if (!item) return;
    item.status = value;
    saveAppointments();
    render();
  }

  function deleteItem(id) {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    appointments = appointments.filter(entry => entry.id !== id);
    saveAppointments();
    render();
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
    const headers = ['Código','Creada','Fecha','Hora','Paciente','Tipo','Servicio','Profesional','WhatsApp','Correo','Motivo','Estado'];
    const rows = appointments.map(a => [a.id,a.createdAt,a.date,a.time,a.name,a.patientType,a.service,a.professional,a.phone,a.email,a.reason,a.status]);
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agenda-lotus-${dateKey(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function loadAppointments() {
    try {
      const parsed = JSON.parse(localStorage.getItem('lotusAppointments') || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAppointments() {
    localStorage.setItem('lotusAppointments', JSON.stringify(appointments));
  }

  function statusOptions(current) {
    return ['Pendiente','Confirmada','Finalizada','Cancelada','No asistió']
      .map(value => `<option${value === current ? ' selected' : ''}>${value}</option>`).join('');
  }

  function formatDate(value) {
    if (!value) return 'Sin fecha';
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
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
