// One geometric line icon family across both local workspaces.
export function navIcon(view) {
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    agent: '<rect x="4" y="6" width="16" height="13" rx="3"/><path d="M12 3v3M9 11v2m6-2v2m-6 3h6M1 11h3m16 0h3"/>',
    actions: '<path d="m4 12 5 5L20 6M4 5h5m6 14h5"/>',
    content: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h6"/>',
    project: '<path d="M4 21V5m0 1c5-5 10 5 16 0v10c-6 5-11-5-16 0"/>'
  };
  const name = ({ flow: 'agent', facts: 'project' })[view] || view;
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.overview}</svg>`;
}
