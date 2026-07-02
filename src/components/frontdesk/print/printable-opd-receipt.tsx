import type { OpdReceiptPayload } from "@/lib/opd-receipt";
import { formatInr, formatReceiptDate } from "@/lib/opd-receipt";
import { formatGstPercent } from "@/lib/gst-invoicing";
import { NavayuLetterhead, letterheadStyles as s } from "@/components/doctor/print/navayu-letterhead";

type PrintableOpdReceiptProps = {
  receipt: OpdReceiptPayload;
};

export function PrintableOpdReceipt({ receipt }: PrintableOpdReceiptProps) {
  return (
    <NavayuLetterhead docTitle="Tax Invoice / Receipt">
      <div style={s.metaGrid}>
        <div>
          <strong>Invoice:</strong> {receipt.invoiceNumber}
          <br />
          <strong>Date:</strong> {formatReceiptDate(receipt.issuedAt)}
          <br />
          <strong>Patient:</strong> {receipt.patientName}
          <br />
          <strong>Mobile:</strong> {receipt.patientPhone}
        </div>
        <div>
          <strong>UHID:</strong> {receipt.patientUhid}
          <br />
          <strong>Doctor:</strong> {receipt.doctorName}
          <br />
          <strong>Token:</strong> {receipt.token != null ? `#${receipt.token}` : "—"}
          <br />
          <strong>Payment:</strong> {receipt.paymentMode.toUpperCase()}
        </div>
      </div>

      <div style={{ marginBottom: "12px", fontSize: "10px", color: "#374151" }}>
        <strong>GSTIN:</strong> {receipt.gst.gstin}
        <br />
        <strong>{receipt.gst.legalName}</strong>
        <br />
        {receipt.gst.address}
        <br />
        <strong>Place of supply:</strong> {receipt.placeOfSupply}
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>#</th>
            <th style={s.th}>Description</th>
            <th style={s.th}>SAC</th>
            <th style={s.th}>Qty</th>
            <th style={s.th}>Taxable</th>
            <th style={s.th}>GST</th>
            <th style={{ ...s.th, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((line, i) => (
            <tr key={`${line.label}-${i}`}>
              <td style={s.td}>{i + 1}</td>
              <td style={s.td}>{line.label}</td>
              <td style={s.td}>{line.sacCode ?? receipt.gst.sacCode}</td>
              <td style={s.td}>{line.quantity}</td>
              <td style={s.td}>{formatInr(line.taxableAmount ?? line.lineTotal - (line.cgst ?? 0) - (line.sgst ?? 0) - (line.igst ?? 0))}</td>
              <td style={s.td}>{formatGstPercent(line.gstRatePercent ?? 0)}</td>
              <td style={{ ...s.td, textAlign: "right" }}>{formatInr(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={s.td} colSpan={6}>
              Subtotal
            </td>
            <td style={{ ...s.td, textAlign: "right" }}>{formatInr(receipt.subtotal)}</td>
          </tr>
          {receipt.discount > 0 && (
            <tr>
              <td style={s.td} colSpan={6}>
                {receipt.discountMode === "percent" && receipt.discountPercent
                  ? `Discount (${receipt.discountPercent}%)`
                  : "Discount"}
              </td>
              <td style={{ ...s.td, textAlign: "right" }}>-{formatInr(receipt.discount)}</td>
            </tr>
          )}
          {receipt.cgstTotal > 0 && (
            <tr>
              <td style={s.td} colSpan={6}>
                CGST
              </td>
              <td style={{ ...s.td, textAlign: "right" }}>{formatInr(receipt.cgstTotal)}</td>
            </tr>
          )}
          {receipt.sgstTotal > 0 && (
            <tr>
              <td style={s.td} colSpan={6}>
                SGST
              </td>
              <td style={{ ...s.td, textAlign: "right" }}>{formatInr(receipt.sgstTotal)}</td>
            </tr>
          )}
          {receipt.igstTotal > 0 && (
            <tr>
              <td style={s.td} colSpan={6}>
                IGST
              </td>
              <td style={{ ...s.td, textAlign: "right" }}>{formatInr(receipt.igstTotal)}</td>
            </tr>
          )}
          <tr>
            <td style={{ ...s.td, fontWeight: 700 }} colSpan={6}>
              Grand total
            </td>
            <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{formatInr(receipt.total)}</td>
          </tr>
          <tr>
            <td style={s.td} colSpan={6}>
              Collected
            </td>
            <td style={{ ...s.td, textAlign: "right" }}>{formatInr(receipt.amountPaid)}</td>
          </tr>
          {receipt.balanceDue > 0 && (
            <tr>
              <td style={s.td} colSpan={6}>
                Balance due
              </td>
              <td style={{ ...s.td, textAlign: "right", fontWeight: 700 }}>{formatInr(receipt.balanceDue)}</td>
            </tr>
          )}
        </tfoot>
      </table>

      <div style={{ marginTop: "16px", fontSize: "10px", color: "#6b7280" }}>
        Status: <strong>{receipt.billingStatus.toUpperCase()}</strong>
        {receipt.paymentScope ? ` · ${receipt.paymentScope} payment` : ""}
        {receipt.taxTotal === 0 ? " · GST exempt healthcare service" : ` · Total tax ${formatInr(receipt.taxTotal)}`}
        {receipt.routingNote ? (
          <>
            <br />
            {receipt.routingNote}
          </>
        ) : null}
      </div>
      <div style={{ marginTop: "12px", fontSize: "10px", color: "#6b7280" }}>
        This is a computer-generated tax invoice. Thank you for choosing {receipt.gst.legalName}.
      </div>
    </NavayuLetterhead>
  );
}
