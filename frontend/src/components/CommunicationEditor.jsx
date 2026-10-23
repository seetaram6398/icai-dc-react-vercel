import { useEffect, useMemo, useRef, useState } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

// Collapse editor output that only contains empty paragraphs to a blank string
// so "required" fields behave like a plain textarea.
function normalize(data) {
  const html = String(data || '').trim();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  return text ? html : '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Communication letter editor.
 *
 * The letter is shown as a sheet with three parts:
 *   - "From"   - auto filled from the signed-in user and locked (read only).
 *   - body     - the only editable part (the middle of the letter).
 *   - closing  - fixed sign-off block.
 *
 * `onChange` receives the whole letter as one HTML string so it can be stored
 * on the complaint as the communication remarks.
 */
export default function CommunicationEditor({
  fromName = '',
  fromDesignation = '',
  fromEmail = '',
  toName = '',
  toDesignation = '',
  toEmail = '',
  body = '',
  onChange,
  onBodyChange,
  placeholder = 'Type the communication here...',
  required = false,
  disabled = false,
}) {
  const editorRef = useRef(null);
  const [bodyHtml, setBodyHtml] = useState(body || '');

  useEffect(() => {
    setBodyHtml(body || '');
  }, [body]);

  const fromBlock = useMemo(() => {
    const parts = [`<strong>From:</strong> ${escapeHtml(fromName)}`];
    if (fromDesignation) parts.push(`<div>${escapeHtml(fromDesignation)}</div>`);
    if (fromEmail) parts.push(`<div>${escapeHtml(fromEmail)}</div>`);
    return parts.join('');
  }, [fromName, fromDesignation, fromEmail]);

  const toBlock = useMemo(() => {
    if (!toName && !toDesignation && !toEmail) return '';
    const parts = [`<strong>To:</strong> ${escapeHtml(toName)}`];
    if (toDesignation) parts.push(`<div>${escapeHtml(toDesignation)}</div>`);
    if (toEmail) parts.push(`<div>${escapeHtml(toEmail)}</div>`);
    return parts.join('');
  }, [toName, toDesignation, toEmail]);

  const closingBlock = useMemo(() => {
    const parts = ['<div>Yours faithfully,</div>', '<div>&nbsp;</div>', `<div><strong>${escapeHtml(fromName)}</strong></div>`];
    if (fromDesignation) parts.push(`<div>${escapeHtml(fromDesignation)}</div>`);
    return parts.join('');
  }, [fromName, fromDesignation]);

  // Keep the parent in sync with the complete letter.
  useEffect(() => {
    if (typeof onChange === 'function') {
      const to = toBlock ? `<div>${toBlock}</div>` : '';
      onChange(`<div>${fromBlock}</div>${to}<div>${bodyHtml || ''}</div><div>${closingBlock}</div>`);
    }
  }, [fromBlock, toBlock, bodyHtml, closingBlock, onChange]);

  // Report the editable part on its own so the parent can insist on it.
  useEffect(() => {
    if (typeof onBodyChange === 'function') onBodyChange(bodyHtml);
  }, [bodyHtml, onBodyChange]);

  return (
    <div className="communication-editor">
      <div className="communication-sheet">
        <div className="communication-block communication-block-locked">
          <div className="communication-block-label">
            <i className="bi bi-lock-fill me-1" />
            From <span className="text-muted fw-normal">(auto filled - cannot be changed)</span>
          </div>
          <div
            className="communication-block-body"
            contentEditable={false}
            dangerouslySetInnerHTML={{ __html: fromBlock }}
          />
        </div>

        {toBlock && (
          <div className="communication-block communication-block-locked">
            <div className="communication-block-label">
              <i className="bi bi-lock-fill me-1" />
              To <span className="text-muted fw-normal">(auto filled - cannot be changed)</span>
            </div>
            <div
              className="communication-block-body"
              contentEditable={false}
              dangerouslySetInnerHTML={{ __html: toBlock }}
            />
          </div>
        )}

        <div className="communication-block">
          <div className="communication-block-label">
            <i className="bi bi-pencil-square me-1" />
            Communication <span className="text-muted fw-normal">(only this part can be changed)</span>
          </div>
          <div className="rich-editor-wrap">
            <CKEditor
              editor={ClassicEditor}
              data={bodyHtml || ''}
              disabled={disabled}
              config={{
                toolbar: [
                  'heading',
                  '|',
                  'bold',
                  'italic',
                  'underline',
                  '|',
                  'bulletedList',
                  'numberedList',
                  '|',
                  'blockQuote',
                  'link',
                  '|',
                  'undo',
                  'redo',
                ],
                placeholder,
              }}
              onReady={(editor) => {
                editorRef.current = editor;
              }}
              onChange={(event, editor) => setBodyHtml(normalize(editor.getData()))}
            />
            {required && (
              <textarea
                tabIndex={-1}
                aria-hidden="true"
                className="rich-hidden-field"
                value={String(bodyHtml || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()}
                readOnly
                required
              />
            )}
          </div>
        </div>

        <div className="communication-block communication-block-locked">
          <div className="communication-block-label">
            <i className="bi bi-lock-fill me-1" />
            Closing <span className="text-muted fw-normal">(auto filled - cannot be changed)</span>
          </div>
          <div
            className="communication-block-body"
            contentEditable={false}
            dangerouslySetInnerHTML={{ __html: closingBlock }}
          />
        </div>
      </div>
    </div>
  );
}
