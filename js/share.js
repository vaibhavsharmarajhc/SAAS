/**
 * VSH Legal - Case & Practice Manager Share Module
 * Generates custom client update cards and formatted templates for WhatsApp and Email.
 */

import db from './db.js';

const shareModule = {
  init() {
    this.setupSelects();
    this.setupGenerateActions();
    this.setupClipboard();
  },

  render() {
    this.populateClientSelect();
  },

  /**
   * Populate clients select list
   */
  populateClientSelect() {
    const clients = db.getClients();
    const select = document.getElementById('share-client-select');
    if (!select) return;

    // Preserve selection if possible
    const selectedVal = select.value || '';
    
    select.innerHTML = '<option value="" disabled selected>-- Select Client --</option>';
    clients.forEach(c => {
      select.innerHTML += `<option value="${c.id}">${c.name} (${c.type})</option>`;
    });

    if (selectedVal && clients.find(c => c.id === selectedVal)) {
      select.value = selectedVal;
      select.dispatchEvent(new Event('change'));
    }
  },

  /**
   * Set up select change cascades (Client -> Case -> Autofill)
   */
  setupSelects() {
    const clientSelect = document.getElementById('share-client-select');
    const caseSelect = document.getElementById('share-case-select');
    const nextDateInput = document.getElementById('share-next-date');
    const feeInput = document.getElementById('share-fee-confirm');
    const summaryInput = document.getElementById('share-status-summary');

    clientSelect.addEventListener('change', (e) => {
      const clientId = e.target.value;
      const cases = db.getCasesForClient(clientId);

      caseSelect.innerHTML = '<option value="" disabled selected>-- Select Linked Case --</option>';
      cases.forEach(cs => {
        caseSelect.innerHTML += `<option value="${cs.id}">${cs.title} (${cs.caseNumber})</option>`;
      });

      // Clear details
      nextDateInput.value = '';
      feeInput.value = 0;
      summaryInput.value = '';
    });

    caseSelect.addEventListener('change', (e) => {
      const caseId = e.target.value;
      const cs = db.getCase(caseId);
      if (!cs) return;

      const balance = db.getCaseBalance(caseId);
      
      // Autofill values
      nextDateInput.value = cs.nextHearingDate || '';
      feeInput.value = balance.outstanding;
      summaryInput.value = `The case is listed next for "${cs.stage}" on ${cs.nextHearingDate || 'TBD'}.`;
    });
  },

  /**
   * Actions to compile message formats and update href targets
   */
  setupGenerateActions() {
    const btnGenerate = document.getElementById('btn-generate-share');
    
    btnGenerate.addEventListener('click', () => {
      const clientId = document.getElementById('share-client-select').value;
      const caseId = document.getElementById('share-case-select').value;

      if (!clientId || !caseId) {
        alert("Please select both a Client and a Case before generating templates.");
        return;
      }

      this.generateTemplates(clientId, caseId);
    });
  },

  generateTemplates(clientId, caseId) {
    const client = db.getClient(clientId);
    const cs = db.getCase(caseId);
    const settings = db.getSettings();

    const summaryText = document.getElementById('share-status-summary').value.trim();
    const nextDate = document.getElementById('share-next-date').value;
    const feeVal = parseFloat(document.getElementById('share-fee-confirm').value) || 0;

    const formattedDate = nextDate ? new Date(nextDate).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : 'Not Scheduled';

    // 1. Render Digital Card visualizer preview
    const previewContainer = document.getElementById('share-card-body-render');
    previewContainer.innerHTML = `
      <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:0.25rem;">CASE INTIMATION UPDATE</div>
      <h2 style="font-family:'Playfair Display', serif; font-size:1.3rem; color:var(--text-primary); line-height:1.2; margin-bottom:0.75rem;">${cs.title}</h2>
      
      <div style="background-color:rgba(217, 119, 6, 0.08); border:1px solid rgba(217, 119, 6, 0.2); border-radius:var(--radius-md); padding:0.75rem; margin-bottom:0.75rem; text-align:center;">
        <span style="font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary); display:block; letter-spacing:0.05em; margin-bottom:0.15rem;">Next Hearing Date</span>
        <strong style="color:var(--color-primary); font-size:1.1rem;">${formattedDate}</strong>
      </div>

      <div style="font-size:0.8rem; color:var(--text-secondary); display:flex; flex-direction:column; gap:0.4rem; margin-bottom:0.75rem;">
        <div><span>CNR/Ref No:</span> <strong style="color:var(--text-primary);">${cs.caseNumber}</strong></div>
        <div><span>Court Forum:</span> <strong style="color:var(--text-primary);">${cs.court}</strong></div>
        <div><span>Status Directive:</span> <p style="margin-top:0.15rem; color:var(--text-primary); line-height:1.3;">${summaryText || 'Case in progress.'}</p></div>
      </div>

      <div style="border-top:1px dashed rgba(255,255,255,0.1); padding-top:0.75rem; display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
        <span style="color:var(--text-muted);">Outstanding Professional Fees:</span>
        <strong style="color:${feeVal > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; font-size:1.05rem;">₹${feeVal.toLocaleString('en-IN')}</strong>
      </div>
    `;

    // 2. Generate WhatsApp bold text template
    const waText = `*${settings.firmName || 'CounselAI'} - Case Update*
Chambers of *${settings.lawyerName || 'Adv. Vaibhav Sharma'}*
---------------------------------------------

Dear *${client.name}*,

Here is the hearing and status update regarding your matter:
*${cs.title}*

⚖️ *CNR/Ref:* ${cs.caseNumber}
🏛️ *Court Forum:* ${cs.court}
📅 *Next Date of Hearing:* ${formattedDate}

📝 *Hearing Stage / Directives:*
${summaryText || 'Listed for hearing. Update will follow.'}

💸 *Outstanding Professional Fees:* ₹${feeVal.toLocaleString('en-IN')}

_Please reach out to the chamber if you have any questions or require file revisions._

Best regards,
*${settings.lawyerName || 'Adv. Vaibhav Sharma'}*
*${settings.firmName || 'CounselAI'}*`;

    const textarea = document.getElementById('share-text-rendered');
    textarea.value = waText;

    // 3. Set up WhatsApp Web Link
    // Encode phone number (clean up symbols)
    let cleanPhone = client.phone.replace(/[^0-9+]/g, '');
    if (cleanPhone && !cleanPhone.startsWith('+')) {
      // Default Indian country code prefix if 10 digit number
      if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    }
    const encodedText = encodeURIComponent(waText);
    const waLink = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    
    const waBtn = document.getElementById('btn-share-whatsapp');
    waBtn.href = waLink;

    // 4. Set up Email Mailto Link
    const emailSubject = encodeURIComponent(`${settings.firmName || 'CounselAI'} Case Status Update - ${cs.title}`);
    const emailBody = encodeURIComponent(waText.replace(/\*/g, '')); // Strip WhatsApp asterisks for email
    const emailLink = `mailto:${client.email || ''}?subject=${emailSubject}&body=${emailBody}`;
    
    const emailBtn = document.getElementById('btn-share-email');
    emailBtn.href = emailLink;
  },

  /**
   * Copy to Clipboard Action
   */
  setupClipboard() {
    const copyBtn = document.getElementById('btn-copy-clipboard');
    const textarea = document.getElementById('share-text-rendered');

    copyBtn.addEventListener('click', () => {
      if (!textarea.value) {
        alert("Please generate a message first before copying.");
        return;
      }
      
      textarea.select();
      textarea.setSelectionRange(0, 99999); // For mobile devices
      
      try {
        navigator.clipboard.writeText(textarea.value);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i data-lucide="check"></i> Copied to Clipboard!';
        lucide.createIcons();
        
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          lucide.createIcons();
        }, 2000);
      } catch (err) {
        alert("Failed to copy. Please manually select the text area and copy.");
      }
    });
  }
};

export default shareModule;
