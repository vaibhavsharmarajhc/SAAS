/**
 * Track My Chambers - Web Worker for Financial Ledger Calculations & Formatting
 * Offloads heavy currency formatting (toLocaleString), array sorting, and totals reduction.
 */

self.onmessage = function(e) {
  const { action, txs, filterClient, filterType, page, pageSize } = e.data;

  if (action === 'processLedger') {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let monthlyIncome = 0;
    let annualIncome = 0;
    let cumulativeIncome = 0;
    let feesBilled = 0;
    let disbursementsBilled = 0;

    // Single-pass reduction for financial totals
    txs.forEach(t => {
      const tDate = new Date(t.date);
      if (t.type === 'Received') {
        cumulativeIncome += t.amount;
        if (tDate.getFullYear() === currentYear) {
          annualIncome += t.amount;
          if (tDate.getMonth() === currentMonth) {
            monthlyIncome += t.amount;
          }
        }
      } else if (t.type === 'Billed') feesBilled += t.amount;
      else if (t.type === 'Disbursed') disbursementsBilled += t.amount;
    });

    // Filter and sort transactions
    const filtered = txs.filter(t => {
      const matchesClient = filterClient === 'All' || t.clientId === filterClient;
      const matchesType = filterType === 'All' || t.type === filterType;
      return matchesClient && matchesType;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const currentPage = Math.min(page, totalPages);
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    // Pre-format page items for fast DOM injection
    const formattedPageItems = pageItems.map(t => {
      const debitVal = t.type === 'Billed' || t.type === 'Disbursed' ? `₹${t.amount.toLocaleString('en-IN')}` : '-';
      const creditVal = t.type === 'Received' || t.type === 'WrittenOff' ? `₹${t.amount.toLocaleString('en-IN')}` : '-';
      let typeBadgeClass = 'badge-pending';
      if (t.type === 'Received') typeBadgeClass = 'badge-active';
      else if (t.type === 'Disbursed') typeBadgeClass = 'badge-closed';
      else if (t.type === 'WrittenOff') typeBadgeClass = 'badge-danger';

      return {
        ...t,
        debitVal,
        creditVal,
        typeBadgeClass
      };
    });

    self.postMessage({
      action: 'ledgerProcessed',
      totals: {
        monthlyIncome,
        annualIncome,
        cumulativeIncome,
        feesBilled,
        disbursementsBilled
      },
      totalItems,
      totalPages,
      currentPage,
      pageItems: formattedPageItems
    });
  }
};
