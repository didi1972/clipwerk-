/* Kostenlose Videos & Fotos aus dem Internet suchen (Wikimedia, Openverse, Pexels) */
const StockPicker = {
  open(onAdd, onDone) {
    const q = el('input', { class: 'inp big', placeholder: 'Was suchst du? z. B. Strand, Feuerwerk, Hund, Stadt …' });
    const src = el('select', { class: 'sel' }, el('option', { value: 'video' }, 'Videos (Wikimedia)'), el('option', { value: 'image' }, 'Fotos (Wikimedia)'), el('option', { value: 'ov' }, 'Fotos (Openverse)'));
    const grid = el('div', { class: 'sgrid big' });
    const go = async () => {
      if (!q.value.trim()) return;
      grid.replaceChildren(el('div', { class: 'spinner sm' }));
      try {
        const res = src.value === 'ov' ? (await Stock.openverse('images', q.value.trim())).map(r => ({ title: r.title || 'Foto', thumb: r.thumbnail, url: r.url, credit: `„${r.title || 'Foto'}“ von ${r.creator || 'unbekannt'} (${(r.license || '').toUpperCase()}) via Openverse`, landing: r.foreign_landing_url, type: 'image' }))
          : (await Stock.wikimedia(src.value, q.value.trim())).map(r => ({ ...r, type: src.value }));
        if (!res.length) { grid.replaceChildren(el('p', { class: 'muted' }, 'Nichts gefunden – probier ein anderes Wort, auf Englisch klappt es oft besser.')); return; }
        grid.replaceChildren(...res.map(r => {
          const b = el('button', { class: 'sitem', title: r.title, style: r.thumb ? { backgroundImage: `url(${r.thumb})` } : {} }, r.type === 'video' ? el('span', { class: 'mdur mono' }, 'Video') : null);
          b.onclick = async () => { if (b.classList.contains('done')) return; b.classList.add('loading'); const m = await Stock.importUrl([r.url], r.title, r.type, r.credit, r.landing); b.classList.remove('loading'); if (m) { b.classList.add('done'); onAdd && onAdd(m); } };
          return b;
        }));
      } catch (e) { grid.replaceChildren(el('p', { class: 'err' }, e.message)); }
    };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    modal({ title: 'Kostenlose Videos & Fotos holen', wide: true, body: el('div', { class: 'tform' }, el('p', { class: 'muted small' }, 'Alles frei nutzbar (Creative Commons). Klick auf ein Bild oder Video, um es zu übernehmen. Die Quellenangabe merkt sich Clipwerk automatisch.'), el('div', { class: 'row-inline' }, q, src, el('button', { class: 'btn primary', html: icon('search') + 'Suchen', onclick: go })), grid),
      actions: [{ label: 'Fertig', kind: 'primary' }], onClose: () => onDone && onDone() });
    setTimeout(() => q.focus());
  },
};
