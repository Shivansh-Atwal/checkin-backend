"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../config/db"));
class InvoiceService {
    /**
     * Calculate details and generate a checkout invoice
     */
    static calculateStayBill(params) {
        const checkIn = new Date(params.checkInTime);
        const checkOut = new Date(params.expectedCheckOutDate);
        // Calculate nights (minimum of 1 night)
        const diffMs = checkOut.getTime() - checkIn.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const nights = Math.max(1, diffDays);
        const roomCharges = params.pricePerNight * nights;
        const subtotal = roomCharges + params.additionalCharges - 0; // Force 0 discount
        const taxAmount = subtotal * params.taxRate;
        const finalAmount = subtotal + taxAmount;
        return {
            nights,
            roomCharges,
            subtotal,
            taxAmount,
            finalAmount: Math.max(0, finalAmount),
        };
    }
    /**
     * Generates a stylized HTML invoice and saves it locally
     */
    static async generateInvoiceHTML(checkoutId) {
        const checkout = await db_1.default.checkout.findUnique({
            where: { id: checkoutId },
            include: {
                checkIn: {
                    include: {
                        customer: true,
                        room: true,
                    },
                },
            },
        });
        if (!checkout) {
            throw new Error('Checkout record not found.');
        }
        const { customer, room, checkInTime, expectedCheckOutDate, actualCheckOutTime, registrationNumber, pricePerNight } = checkout.checkIn;
        const checkoutTimeToShow = actualCheckOutTime || expectedCheckOutDate;
        const nights = Math.max(1, Math.ceil((checkoutTimeToShow.getTime() - checkInTime.getTime()) / (1000 * 60 * 60 * 24)));
        const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice - ${checkout.id.substring(0, 8)}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
        .invoice-box { max-width: 800px; margin: auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.15); font-size: 16px; line-height: 24px; }
        .invoice-box table { width: 100%; line-height: inherit; text-align: left; border-collapse: collapse; }
        .invoice-box table td { padding: 5px; vertical-align: top; }
        .invoice-box table tr td:nth-child(2) { text-align: right; }
        .invoice-box table tr.top table td { padding-bottom: 20px; }
        .invoice-box table tr.top table td.title { font-size: 45px; line-height: 45px; color: #3b82f6; font-weight: bold; }
        .invoice-box table tr.information table td { padding-bottom: 40px; }
        .invoice-box table tr.heading td { background: #f3f4f6; border-bottom: 1px solid #ddd; font-weight: bold; padding: 10px; }
        .invoice-box table tr.details td { padding-bottom: 20px; }
        .invoice-box table tr.item td { border-bottom: 1px solid #eee; padding: 10px; }
        .invoice-box table tr.item.last td { border-bottom: none; }
        .invoice-box table tr.total td:nth-child(2) { border-top: 2px solid #3b82f6; font-weight: bold; font-size: 18px; padding-top: 10px; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #999; }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <table>
          <tr class="top">
            <td colspan="2">
              <table>
                <tr>
                  <td class="title">HotelFlow</td>
                  <td>
                    Invoice #: HF-${checkout.id.substring(0, 8).toUpperCase()}<br>
                    Created: ${new Date(checkout.createdAt).toLocaleDateString()}<br>
                    Status: ${checkout.billingStatus}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr class="information">
            <td colspan="2">
              <table>
                <tr>
                  <td>
                    <strong>HotelFlow Headquarters</strong><br>
                    100 Hospitality Way<br>
                    Suite 200, Suite City
                  </td>
                  <td>
                    <strong>Customer:</strong> ${customer.fullName}<br>
                    <strong>Mobile:</strong> ${customer.mobileNumber}<br>
                    <strong>Email:</strong> ${customer.email || 'N/A'}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr class="heading">
            <td>Stay Information</td>
            <td>Details</td>
          </tr>
          
          <tr class="details">
            <td>
              Room ${room.roomNumber} (${room.capacity > 2 ? 'Deluxe' : 'Standard'})<br>
              Registration No: ${registrationNumber || 'N/A'}<br>
              Check-In: ${new Date(checkInTime).toLocaleString()}<br>
              Check-Out: ${new Date(checkoutTimeToShow).toLocaleString()}
            </td>
            <td>
              Nights: ${nights}<br>
              Rate: ₹${pricePerNight.toFixed(2)} / night
            </td>
          </tr>
          
          <tr class="heading">
            <td>Charge Description</td>
            <td>Amount</td>
          </tr>
          
          <tr class="item">
            <td>Room Accommodation Charges</td>
            <td>₹${checkout.roomCharges.toFixed(2)}</td>
          </tr>
          
          <tr class="item">
            <td>Additional Service Charges</td>
            <td>₹${checkout.additionalCharges.toFixed(2)}</td>
          </tr>
          
          <tr class="item">
            <td>Discounts Applied</td>
            <td>₹0.00</td>
          </tr>
          
          <tr class="item last">
            <td>Taxes & Fees (GST)</td>
            <td>₹${checkout.taxAmount.toFixed(2)}</td>
          </tr>
          
          <tr class="total">
            <td></td>
            <td>Total: ₹${checkout.finalAmount.toFixed(2)}</td>
          </tr>
        </table>
        <div class="footer">
          Thank you for choosing HotelFlow! Have a wonderful day.
        </div>
      </div>
    </body>
    </html>
    `;
        // Save locally under uploads/invoices
        const invoiceDir = path_1.default.join(__dirname, '..', '..', 'uploads', 'invoices');
        if (!fs_1.default.existsSync(invoiceDir)) {
            fs_1.default.mkdirSync(invoiceDir, { recursive: true });
        }
        const filename = `invoice-${checkout.id}.html`;
        const filepath = path_1.default.join(invoiceDir, filename);
        await fs_1.default.promises.writeFile(filepath, htmlContent);
        // Return URL served statically
        return `/uploads/invoices/${filename}`;
    }
}
exports.InvoiceService = InvoiceService;
