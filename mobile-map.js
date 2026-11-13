// Move the existing form, keeping its values and listeners intact at breakpoints.
export function createMobileMap({ getDraft, isDirty, capture, isMap, fit, ids = {}, bodyClass = 'mobile-map-full', savedLabel = 'Дефект сохранён', resumeLabel = 'Параметры №' }) {
  const $ = id => document.getElementById(ids[id] ?? id);
  const media = matchMedia('(max-width: 700px), (max-height: 500px) and (pointer: coarse)');
  const inspector = $('inspector'), home = inspector.parentElement;
  const dialog = $('mobileDefectDialog');
  let full = true;
  const setError = message => {
    $('mobileCardNotice').textContent = message;
    $('mobileCardNotice').classList.toggle('hidden', !message);
  };
  const sizeSheet = () => {
    if (!window.visualViewport) return;
    const { height, offsetTop } = window.visualViewport;
    dialog.style.setProperty('--sheet-height', `${height * .94}px`);
    dialog.style.setProperty('--sheet-top', `${offsetTop + height * .06}px`);
  };
  window.visualViewport?.addEventListener('resize', sizeSheet);
  window.visualViewport?.addEventListener('scroll', sizeSheet);
  const refresh = () => {
    const draft = getDraft();
    $('mobileDraftBar').classList.toggle('hidden', !draft);
    $('resumeDefect').textContent = draft ? `${resumeLabel} ${draft.number}` : 'Параметры';
    $('mobileDraftStatus').textContent = isDirty() ? 'Есть несохранённые изменения' : savedLabel;
    if (!draft && dialog.open) dialog.close();
  };
  const close = () => {
    if (getDraft()) capture();
    if (dialog.open) dialog.close();
    refresh();
  };
  const sync = () => {
    if (media.matches) {
      if (inspector.parentElement !== dialog) {
        dialog.insertBefore(inspector, $('mobileCardActions'));
        if ($('placementSettings')) $('placementSettings').open = false;
      }
    } else {
      if (dialog.open) dialog.close();
      if (inspector.parentElement !== home) home.append(inspector);
      if ($('placementSettings')) $('placementSettings').open = true;
    }
    $('closeInspector').setAttribute('aria-label', media.matches ? 'К карте' : 'Закрыть карточку');
    document.body.classList.toggle(bodyClass, media.matches && isMap() && full);
    $('mobileMapToggle').textContent = full ? '← Разделы' : 'На весь экран';
    refresh();
  };
  const open = () => {
    if (!getDraft()) return;
    sync();
    if (media.matches) {
      if (!dialog.open) {
        setError('');
        // Focus a button, not a text field: do not summon the phone keyboard.
        $('closeInspector').autofocus = true;
        sizeSheet();
        dialog.showModal();
        $('closeInspector').focus({ preventScroll: true });
        $('defectForm').scrollTop = 0;
      }
    } else if (innerWidth < 850) inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('mobileMapToggle').addEventListener('click', () => {
    full = !full; sync(); requestAnimationFrame(fit);
    if (!full) window.scrollTo({ top: 0 });
  });
  $('resumeDefect').addEventListener('click', open);
  $('mobileBackToMap').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  media.addEventListener('change', sync);
  sizeSheet();
  sync();
  return { open, close, refresh, sync, setError, get mobile() { return media.matches; },
    enter() { full = true; sync(); },
    leave() { full = false; sync(); requestAnimationFrame(fit); },
    setBusy(value) { $('mobileSaveDefect').disabled = value; }
  };
}
