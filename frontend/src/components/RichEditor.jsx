import { useEffect, useRef } from 'react';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

// Collapse editor output that only contains empty paragraphs to a blank string
// so "required" fields and manual .trim() checks behave like a plain textarea.
function normalize(data) {
  const html = String(data || '').trim();
  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  return text ? html : '';
}

export default function RichEditor({ value = '', onChange, placeholder = 'Enter remarks...', required = false, disabled = false }) {
  const editorRef = useRef(null);

  // Reflect external value changes (e.g. programmatic clear after submit);
  // typing is untouched because that path keeps value === editor data.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (normalize(ed.getData()) !== normalize(value)) ed.setData(value || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="rich-editor-wrap">
      <CKEditor
        editor={ClassicEditor}
        data={value || ''}
        disabled={disabled}
        config={{
          toolbar: [
            'heading',
            '|',
            'bold',
            'italic',
            'underline',
            'strikethrough',
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
        onChange={(event, editor) => onChange(normalize(editor.getData()))}
      />
      {required && (
        <textarea
          tabIndex={-1}
          aria-hidden="true"
          className="rich-hidden-field"
          value={String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()}
          readOnly
          required
        />
      )}
    </div>
  );
}