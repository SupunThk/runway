const paths = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  plus: 'M12 5v14 M5 12h14',
  workspace: 'M4 21V5h10v16 M14 9h6v12 M8 9h2 M8 13h2 M8 17h2 M2 21h20',
  borrowing: 'M4 18V6 M4 18h16 M8 14l4-5 4 3 5-7',
  assistant:
    'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M7 9h10 M7 13h6',
  docs: 'M12 5C9 3 5 3 2 4v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1z M12 5v15',
  wallet: 'M20 8V5H6a3 3 0 0 0 0 6h15v9H6a3 3 0 0 1-3-3V8 M21 13h-5v4h5',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3 M5 10h14v11H5z M12 14v3',
} as const;

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="ui-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
