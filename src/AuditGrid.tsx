import { useMemo, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ClientSideRowModelModule,
  CsvExportModule,
  TextFilterModule,
  NumberFilterModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from 'ag-grid-community';
import { Download } from 'lucide-react';
import type { Purchase } from '../shared/types.js';
import { csvCell } from '../shared/export.js';

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CsvExportModule,
  TextFilterModule,
  NumberFilterModule,
]);
const theme = themeQuartz.withParams({
  fontFamily: 'inherit',
  fontSize: 13,
  accentColor: '#2563eb',
  foregroundColor: '#14213d',
  borderColor: '#e5eaf2',
  headerBackgroundColor: '#f7f9fc',
  wrapperBorder: false,
  browserColorScheme: 'light',
});
export default function AuditGrid({
  purchases,
  onOpen,
}: {
  purchases: Purchase[];
  onOpen: (id: string) => void;
}) {
  const grid = useRef<AgGridReact<Purchase>>(null);
  const columns = useMemo<ColDef<Purchase>[]>(
    () => [
      { field: 'title', headerName: 'Purchase', flex: 2, minWidth: 180 },
      {
        field: 'state',
        headerName: 'Status',
        minWidth: 150,
        flex: 1,
        valueFormatter: (p) =>
          String(p.value ?? '')
            .toLowerCase()
            .replaceAll('_', ' '),
      },
      {
        colId: 'amount',
        headerName: 'Amount (USD)',
        valueGetter: (p) => (p.data?.amountCents ?? 0) / 100,
        valueFormatter: (p) =>
          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            p.value ?? 0,
          ),
        filter: 'agNumberColumnFilter',
        minWidth: 140,
      },
      {
        field: 'createdAt',
        headerName: 'Created',
        minWidth: 155,
        valueFormatter: (p) => new Date(p.value).toLocaleString(),
      },
      {
        colId: 'inspect',
        headerName: 'Details',
        filter: false,
        sortable: false,
        width: 110,
        cellRenderer: (p: ICellRendererParams<Purchase>) =>
          p.data ? (
            <button
              className="text-button"
              aria-label={`Inspect ${p.data.title}`}
              onClick={() => onOpen(p.data!.id)}
            >
              Inspect
            </button>
          ) : null,
      },
      { field: 'id', headerName: 'Request ID', hide: true },
      { field: 'source', headerName: 'Planning source', hide: true },
      { field: 'mandateVersion', headerName: 'Mandate version', hide: true },
      { field: 'orderId', headerName: 'PayPal order ID', hide: true },
      { field: 'captureId', headerName: 'PayPal capture ID', hide: true },
    ],
    [onOpen],
  );
  return (
    <div className="audit-grid-section">
      <div className="audit-grid-toolbar">
        <span>AG Grid Community · sort and filter each column</span>
        <button
          className="secondary compact"
          onClick={() =>
            grid.current?.api?.exportDataAsCsv({
              fileName: 'mandate-audit.csv',
              columnKeys: [
                'title',
                'state',
                'amount',
                'createdAt',
                'id',
                'source',
                'mandateVersion',
                'orderId',
                'captureId',
              ],
              processCellCallback: (p) => csvCell(p.value),
            })
          }
        >
          <Download size={15} />
          Export filtered CSV
        </button>
      </div>
      <div className="audit-grid">
        <AgGridReact<Purchase>
          ref={grid}
          theme={theme}
          rowData={purchases}
          columnDefs={columns}
          defaultColDef={{
            sortable: true,
            filter: 'agTextColumnFilter',
            floatingFilter: true,
            resizable: true,
          }}
          getRowId={(p) => p.data.id}
          rowHeight={52}
          headerHeight={42}
          onCellKeyDown={(p) => {
            if (p.event instanceof KeyboardEvent && p.event.key === 'Enter' && p.data)
              onOpen(p.data.id);
          }}
        />
      </div>
    </div>
  );
}
