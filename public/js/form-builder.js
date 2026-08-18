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
            <span class="fb-drag-handle" title="Drag to reorder">⠿</span>
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
      sortableInstance = new Sortable(canvas, {
        handle: '.fb-drag-handle',
        animation: 150,
        onEnd: function (evt) {
          const moved = fields.splice(evt.oldIndex, 1)[0];
          fields.splice(evt.newIndex, 0, moved);
          render();
        }
      });

      syncHiddenInput();
    }

    function addField(base) {
      fields.push({
        id: makeId(),
        type: base.type,
        label: base.label,
        required: !!base.required,
        options: needsOptions(base.type) ? (base.options || ['Option 1', 'Option 2']) : undefined
      });
      render();
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

    render();
  };
})();
