import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const remarkPlugins = [remarkGfm, remarkBreaks];

type ResultMarkdownProps = {
  text: string;
};

/**
 * Renders assistant / streaming text (Markdown + GFM) without raw HTML, so
 * model output (lists, headers, code, links) is readable in the result card.
 */
export default function ResultMarkdown({ text }: ResultMarkdownProps) {
  if (!text) return null;
  return (
    <div className="result-md">
      <ReactMarkdown remarkPlugins={remarkPlugins}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
