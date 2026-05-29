export const PanelPlaceholder = ({ searched = false }: { searched?: boolean }) => {
  return (
    <div className="tc-panel-placeholder">
      {searched ? 'No data for this period' : 'Run a search to see your data'}
    </div>
  );
};
