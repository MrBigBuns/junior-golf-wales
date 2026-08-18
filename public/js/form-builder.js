(function () {
  const FIELD_TYPES = [
    { type: 'text', label: 'Short text', icon: '✏️' },
    { type: 'textarea', label: 'Long text', icon: '📝' },
    { type: 'email', label: 'Email', icon: '✉️' },
    { type: 'tel', label: 'Phone', icon: '📞' },
    { type: 'number', label: 'Number', icon: '#' },
    { type: 'date', label: 'Date', icon: '📅' },
    { type: 'select', label: 'Dropdown', icon: '▾' },
    { type: 'radio', label: 'Multiple choice', icon: '◉' },
    { type: 'checkbox', label: 'Checkbox (yes/no)', icon: '☑' },
    { type: 'heading', label: 'Section heading', icon: '≡' }
  ];

  const AGE_PRESET = {
    type: 'select',
    label: 'Age category',
    required: true,
    options: ['Under 9', '9-11', '12-13', '14-15', '16-17', '18+']
  };

  function makeId() {
    return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.initFormBuilder = function (initialFields) {
    const fields = (initialFields || []).map(f => ({ ...f, id: f.id || makeId() }));
    const canvas = document.getElementById('form-canvas');
    const palette = document.getElementById('field-palette');
    const hiddenInput = document.getElementById('fields-json-input');
    const previewBtn = document.getElementById('preview-form-btn');
    const previewOverlay = document.getElementById('form-preview-overlay');
    let sortableInstance = null;

    function syncHiddenInput() {
      hiddenInput.value = JSON.stringify(fields);
    }

    function needsOptions(type) {
      return type === 'select' || type === 'radio';
    }

    function fieldCardHtml(f, i) {
      return `
        <div class="fb-card" data-index="${i}">
          <div class="fb-card-header">
            <span class="fb-drag-handle" title="Drag to reorder">⠿ Drag</span>
            <span class="fb-type-badge">${escapeHtml(FIELD_TYPES.find(t => t.type === f.type)?.icon || '')} ${escapeHtml(f.type)}</span>
            <label class="fb-required-toggle">
              <input type="checkbox" class="fb-required-checkbox" ${f.required ? 'checked' : ''} ${f.type === 'heading' ? 'disabled' : ''}>
              Required
            </label>
            <button type="button" class="fb-delete-btn" aria-label="Delete field">&times;</button>
          </div>
          <label class="fb-field-label-wrap">
            ${f.type === 'heading' ? 'Heading text' : 'Question / label'}
            <input type="text" class="fb-label-input">
          </label>
          ${needsOptions(f.type) ? `
            <label class="fb-field-label-wrap">
              Options (one per line)
              <textarea class="fb-options-textarea" rows="3"></textarea>
            </label>
          ` : ''}
        </div>
      `;
    }

    function render() {
      canvas.innerHTML = fields.length
        ? fields.map(fieldCardHtml).join('')
        : '<p class="scorecard-note">Click or drag a field from the left to add it here.</p>';

      fields.forEach((f, i) => {
        const card = canvas.querySelector(`[data-index="${i}"]`);
        if (!card) return;
        const labelInput = card.querySelector('.fb-label-input');
        if (labelInput) labelInput.value = f.label;
        const optionsTextarea = card.querySelector('.fb-options-textarea');
        if (optionsTextarea) optionsTextarea.value = (f.options || []).join('\n');
      });

      if (sortableInstance) sortableInstance.destroy();
      if (typeof Sortable !== 'undefined') {
        sortableInstance = new Sortable(canvas, {
          handle: '.fb-drag-handle',
          animation: 150,
          group: { name: 'formBuilder', pull: false, put: true },
          onAdd: function (evt) {
            // A palette item was dropped in — the dropped node is a raw
            // clone of the palette button, not our card markup. Read what
            // type it represents, remove the raw clone, and let addField
            // build the real card in its place via a normal re-render.
            const clone = evt.item;
            const insertIndex = evt.newIndex;
            clone.remove();

            let base;
            if (clone.dataset.preset === 'age') {
              base = AGE_PRESET;
            } else {
              const type = clone.dataset.type;
              const meta = FIELD_TYPES.find(t => t.type === type);
              if (!meta) return;
              base = { type, label: meta.label };
            }
            addField(base, insertIndex);
          },
          onEnd: function (evt) {
            if (evt.from !== evt.to) return; // handled by onAdd instead
            const moved = fields.splice(evt.oldIndex, 1)[0];
            fields.splice(evt.newIndex, 0, moved);
            render();
          }
        });
      } else {
        console.warn('Sortable library did not load — drag-to-reorder is unavailable, but adding/editing fields still works.');
      }

      syncHiddenInput();
    }

    function addField(base, insertIndex) {
      const newField = {
        id: makeId(),
        type: base.type,
        label: base.label,
        required: !!base.required,
        options: needsOptions(base.type) ? (base.options || ['Option 1', 'Option 2']) : undefined
      };
      let atIndex;
      if (insertIndex === undefined || insertIndex === null) {
        fields.push(newField);
        atIndex = fields.length - 1;
      } else {
        fields.splice(insertIndex, 0, newField);
        atIndex = insertIndex;
      }
      render();

      // Auto-focus the new field's label so it's immediately editable —
      // no extra click needed to start typing the real question.
      const newCard = canvas.querySelector(`[data-index="${atIndex}"]`);
      if (newCard) {
        const labelInput = newCard.querySelector('.fb-label-input');
        if (labelInput) {
          labelInput.focus();
          labelInput.select();
        }
      }
    }

    // Palette: click to add
    palette.addEventListener('click', function (e) {
      const btn = e.target.closest('.fb-palette-item');
      if (!btn) return;
      if (btn.dataset.preset === 'age') {
        addField(AGE_PRESET);
      } else {
        const type = btn.dataset.type;
        const meta = FIELD_TYPES.find(t => t.type === type);
        addField({ type, label: meta.label });
      }
    });

    // Palette: drag out to the canvas (clone — palette stays reusable)
    if (typeof Sortable !== 'undefined') {
      new Sortable(palette, {
        group: { name: 'formBuilder', pull: 'clone', put: false },
        sort: false,
        animation: 150
      });
    }

    // Canvas: delegated events for edits within cards
    canvas.addEventListener('input', function (e) {
      const card = e.target.closest('.fb-card');
      if (!card) return;
      const i = parseInt(card.dataset.index, 10);
      if (e.target.classList.contains('fb-label-input')) {
        fields[i].label = e.target.value;
        syncHiddenInput();
      } else if (e.target.classList.contains('fb-options-textarea')) {
        fields[i].options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
        syncHiddenInput();
      }
    });

    canvas.addEventListener('change', function (e) {
      const card = e.target.closest('.fb-card');
      if (!card) return;
      const i = parseInt(card.dataset.index, 10);
      if (e.target.classList.contains('fb-required-checkbox')) {
        fields[i].required = e.target.checked;
        syncHiddenInput();
      }
    });

    canvas.addEventListener('click', function (e) {
      const delBtn = e.target.closest('.fb-delete-btn');
      if (!delBtn) return;
      const card = delBtn.closest('.fb-card');
      const i = parseInt(card.dataset.index, 10);
      fields.splice(i, 1);
      render();
    });

    // Live preview — mirrors how the public register page renders each
    // field type, using the current unsaved edits (not what's in the DB).
    function fieldPreviewHtml(f) {
      const req = f.required ? ' *' : '';
      if (f.type === 'heading') {
        return `<h3>${escapeHtml(f.label)}</h3>`;
      }
      if (f.type === 'textarea') {
        return `<label class="fb-preview-field">${escapeHtml(f.label)}${req}<textarea rows="3"></textarea></label>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option>${escapeHtml(o)}</option>`).join('');
        return `<label class="fb-preview-field">${escapeHtml(f.label)}${req}<select><option value="">— choose —</option>${opts}</select></label>`;
      }
      if (f.type === 'radio') {
        const opts = (f.options || []).map(o => `<label class="fb-preview-radio"><input type="radio" name="preview_${f.id}" disabled> ${escapeHtml(o)}</label>`).join('');
        return `<fieldset class="fb-preview-field"><legend>${escapeHtml(f.label)}${req}</legend>${opts}</fieldset>`;
      }
      if (f.type === 'checkbox') {
        return `<label class="fb-preview-checkbox"><input type="checkbox"> ${escapeHtml(f.label)}${req}</label>`;
      }
      return `<label class="fb-preview-field">${escapeHtml(f.label)}${req}<input type="${escapeHtml(f.type)}"></label>`;
    }

    function openPreview() {
      const titleInput = document.querySelector('input[name="title"]');
      const descInput = document.querySelector('textarea[name="description"]');
      const title = (titleInput && titleInput.value) || 'Entry form';
      const description = descInput ? descInput.value : '';

      previewOverlay.innerHTML = `
        <div class="fb-preview-modal">
          <button type="button" id="fb-preview-close" class="fb-preview-close" aria-label="Close preview">&times;</button>
          <p class="scorecard-note">Preview — this is how the public form will look. Nothing here submits.</p>
          <h2>${escapeHtml(title)}</h2>
          ${description ? `<p>${escapeHtml(description)}</p>` : ''}
          <div class="fb-preview-fields">
            ${fields.length ? fields.map(fieldPreviewHtml).join('') : '<p class="scorecard-note">No fields added yet.</p>'}
          </div>
        </div>
      `;
      previewOverlay.style.display = 'flex';
      document.getElementById('fb-preview-close').addEventListener('click', closePreview);
    }

    function closePreview() {
      previewOverlay.style.display = 'none';
      previewOverlay.innerHTML = '';
    }

    if (previewBtn) previewBtn.addEventListener('click', openPreview);
    if (previewOverlay) {
      previewOverlay.addEventListener('click', function (e) {
        if (e.target === previewOverlay) closePreview();
      });
    }

    render();
  };
})();
