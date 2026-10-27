import {
  db,
  serverTimestamp,
  Timestamp,
  collection,
  doc,
  setDoc
} from './firebase.js';

(() => {
  'use strict';

  const config = window.LOTUS_CONFIG || {};
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  const bookingForm = document.getElementById('booking-form');
  const dateInput = document.getElementById('date');
  const timeSelect = document.getElementById('time');
  const serviceSelect = document.getElementById('service');
  const professionalSelect = document.getElementById('professional');
  const status = document.getElementById('form-status');
  const modal = document.getElementById('confirmation-modal');
  const submitButton = bookingForm?.querySelector('button[type="submit"]');

  document.getElementById('year').textContent = new Date().getFullYear();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + (config.booking?.maxAdvanceDays || 60));
  dateInput.min = toDateString(today);
  dateInput.max = toDateString(maxDate);

  navToggle?.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    navToggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    document.body.classList.toggle('menu-open', isOpen);
  });

  mainNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));

  document.querySelectorAll('.service-book').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-service]');
      if (card && serviceSelect) serviceSelect.value = card.dataset.service;
      document.getElementById('agenda').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => serviceSelect?.focus(), 550);
    });
  });

  document.querySelectorAll('.doctor-book').forEach(button => {
    button.addEventListener('click', () => {
      if (professionalSelect && button.dataset.professional) {
        professionalSelect.value = button.dataset.professional;
      }
      document.getElementById('agenda').scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => professionalSelect?.focus(), 550);
    });
  });

  dateInput.addEventListener('change', populateTimes);

  bookingForm.addEventListener('submit', async event => {
    event.preventDefault();
    status.textContent = '';
    status.className = 'form-status';

    if (!bookingForm.checkValidity()) {
      bookingForm.reportValidity();
      setStatus('Revisa los campos obligatorios antes de continuar.', 'error');
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData(bookingForm);
      const raw = Object.fromEntries(formData.entries());
      const appointmentRef = doc(collection(db, 'appointments'));
      const code = `LOT-${new Date().getFullYear()}-${appointmentRef.id.slice(0, 6).toUpperCase()}`;
      const appointmentDate = makeBogotaDate(raw.date, raw.time);

      if (!appointmentDate) throw new Error('Fecha u hora inválida.');

      const appointment = {
        code,
        patientType: cleanText(raw.patientType, 60),
        service: cleanText(raw.service, 120),
        professional: cleanText(raw.professional, 120),
        date: raw.date,
        time: raw.time,
        appointmentAt: Timestamp.fromDate(appointmentDate),
        name: cleanText(raw.name, 120),
        phone: cleanPhone(raw.phone),
        email: cleanText(raw.email || '', 180).toLowerCase(),
        reason: cleanText(raw.reason || '', 800),
        consent: Boolean(formData.get('consent')),
        status: 'Pendiente',
        source: 'web',
        timezone: 'America/Bogota',
        clientCreatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        internalNotes: ''
      };

      await setDoc(appointmentRef, appointment);

      document.getElementById('confirmation-code').textContent = code;
      document.getElementById('confirmation-text').textContent = `${appointment.name}, registramos tu solicitud para ${appointment.service} el ${formatDate(appointment.date)} a las ${formatTimeValue(appointment.time)}.`;

      if (typeof modal.showModal === 'function') modal.showModal();
      else alert(`Solicitud registrada. Código: ${code}`);

      bookingForm.reset();
      timeSelect.innerHTML = '<option value="">Primero selecciona una fecha</option>';
      timeSelect.disabled = true;
      setStatus('Tu solicitud quedó guardada correctamente.', 'success');
    } catch (error) {
      console.error('Error guardando la cita:', error);
      setStatus('No pudimos registrar la cita. Revisa tu conexión e inténtalo nuevamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  });

  modal?.querySelector('.modal-close')?.addEventListener('click', () => modal.close());
  modal?.querySelector('.modal-ok')?.addEventListener('click', () => modal.close());
  modal?.addEventListener('click', event => {
    if (event.target === modal) modal.close();
  });

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  function closeMenu() {
    mainNav?.classList.remove('open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.setAttribute('aria-label', 'Abrir menú');
    document.body.classList.remove('menu-open');
  }

  function populateTimes() {
    const selected = parseLocalDate(dateInput.value);
    timeSelect.innerHTML = '';

    if (!selected) {
      timeSelect.disabled = true;
      timeSelect.innerHTML = '<option value="">Primero selecciona una fecha</option>';
      return;
    }

    const day = selected.getDay();
    if (day === 0) {
      timeSelect.disabled = true;
      timeSelect.innerHTML = '<option value="">Domingos sin atención</option>';
      return;
    }

    const schedule = config.booking || {};
    const start = day === 6 ? (schedule.startHourSaturday || 8) : (schedule.startHourWeekday || 8);
    const end = day === 6 ? (schedule.endHourSaturday || 13) : (schedule.endHourWeekday || 18);
    const interval = schedule.slotMinutes || 30;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona un horario';
    timeSelect.appendChild(placeholder);

    for (let minutes = start * 60; minutes < end * 60; minutes += interval) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const rawValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      const option = document.createElement('option');
      option.value = rawValue;
      option.textContent = formatTimeValue(rawValue);
      timeSelect.appendChild(option);
    }
    timeSelect.disabled = false;
  }

  function setSubmitting(isSubmitting) {
    if (!submitButton) return;
    submitButton.disabled = isSubmitting;
    submitButton.textContent = isSubmitting ? 'Guardando cita…' : 'Solicitar mi cita';
  }

  function setStatus(message, type) {
    status.textContent = message;
    status.className = 'form-status';
    if (type) status.classList.add(type);
  }

  function cleanText(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function cleanPhone(value) {
    return String(value ?? '').replace(/[^0-9+\s()-]/g, '').trim().slice(0, 30);
  }

  function makeBogotaDate(dateValue, timeValue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '') || !/^\d{2}:\d{2}$/.test(timeValue || '')) return null;
    const date = new Date(`${dateValue}T${timeValue}:00-05:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTimeValue(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return value || '';
    const [hour, minute] = value.split(':').map(Number);
    const date = new Date(2020, 0, 1, hour, minute);
    return new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' }).format(date);
  }

  function formatDate(value) {
    const date = parseLocalDate(value);
    return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }

  function parseLocalDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
})();
