// zugferd.js — ZUGFeRD 2.x / Factur-X, Profil EN 16931 (Cross Industry Invoice, CII) für die Einbettung ins PDF.
// Aufbau wie die ZUGFeRD-Rechnungen aus der Sicherheitsplanung (CrossIndustryInvoice mit ExchangedDocument,
// Positionen, Verkäufer/Käufer, Zahlung, Steuer, Summen). Nicht amtlich validiert — vor dem ersten Einsatz einmal
// durch einen Prüfdienst (z. B. Mustang-Validator oder KoSIT) schicken.
'use strict';
const DB = require('./db');

const x = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const b = v => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
const d102 = iso => String(iso || '').slice(0, 10).replace(/-/g, '');
const einheit = s => /std/i.test(s || '') ? 'HUR' : /monat/i.test(s || '') ? 'MON' : 'C62';

function xml(db, r) {
  const e = DB.einstellungen(db), satz = r.ust_prozent, kat = r.steuerfall === 'reverse_charge' ? 'AE' : 'S';
  const register = [e.amtsgericht ? 'Amtsgericht: ' + e.amtsgericht : '', e.handelsregister ? 'Handelsregister: ' + e.handelsregister : '', e.steuernummer ? 'Steuernummer: ' + e.steuernummer : '',
    [e.geschaeftsfuehrung ? 'Geschäftsführung: ' + e.geschaeftsfuehrung : '', e.gesellschafter ? 'Gesellschafter: ' + e.gesellschafter : ''].filter(Boolean).join(', '), e.firma_sitz ? 'Unternehmenssitz: ' + e.firma_sitz : ''].filter(Boolean).join('\n');
  // EN 16931 BR-27: der Einzelpreis darf nicht negativ sein — Nachlass/Gutschriftzeile als negative Menge, Betrag gleich
  const zeilen = r.positionen.map(function (p) { return p.einzelpreis < 0 ? Object.assign({}, p, { menge: -p.menge, einzelpreis: -p.einzelpreis }) : p; }).map(function (p, i) {
    return '    <ram:IncludedSupplyChainTradeLineItem>\n      <ram:AssociatedDocumentLineDocument><ram:LineID>' + (i + 1) + '</ram:LineID></ram:AssociatedDocumentLineDocument>\n' +
      '      <ram:SpecifiedTradeProduct><ram:Name>' + x(p.bezeichnung) + '</ram:Name>' + (p.gruppe ? '<ram:Description>' + x(p.gruppe) + '</ram:Description>' : '') + '</ram:SpecifiedTradeProduct>\n' +
      '      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>' + b(p.einzelpreis) + '</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>\n' +
      '      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="' + einheit(p.einheit) + '">' + p.menge + '</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>\n' +
      '      <ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>' + kat + '</ram:CategoryCode><ram:RateApplicablePercent>' + b(satz) + '</ram:RateApplicablePercent></ram:ApplicableTradeTax>' +
      '<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>' + b(p.betrag) + '</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>\n' +
      '    </ram:IncludedSupplyChainTradeLineItem>';
  }).join('\n');
  const partei = (rolle, name, strasse, plz, ort, email, ustid, stnr) => '      <ram:' + rolle + '>\n        <ram:Name>' + x(name) + '</ram:Name>\n' +
    '        <ram:PostalTradeAddress><ram:PostcodeCode>' + x(plz) + '</ram:PostcodeCode><ram:LineOne>' + x(strasse) + '</ram:LineOne><ram:CityName>' + x(ort) + '</ram:CityName><ram:CountryID>DE</ram:CountryID></ram:PostalTradeAddress>\n' +
    (email ? '        <ram:URIUniversalCommunication><ram:URIID schemeID="EM">' + x(email) + '</ram:URIID></ram:URIUniversalCommunication>\n' : '') +
    (ustid ? '        <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">' + x(ustid) + '</ram:ID></ram:SpecifiedTaxRegistration>\n' : '') +
    (stnr ? '        <ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">' + x(stnr) + '</ram:ID></ram:SpecifiedTaxRegistration>\n' : '') + '      </ram:' + rolle + '>\n';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">\n' +
    '  <rsm:ExchangedDocumentContext><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>\n' +
    '  <rsm:ExchangedDocument>\n    <ram:ID>' + x(r.nummer) + '</ram:ID>\n    <ram:TypeCode>' + (r.storno_von ? '384' : '380') + '</ram:TypeCode>\n' +
    '    <ram:IssueDateTime><udt:DateTimeString format="102">' + d102(r.datum) + '</udt:DateTimeString></ram:IssueDateTime>\n' +
    (register ? '    <ram:IncludedNote><ram:Content>' + x(register) + '</ram:Content><ram:SubjectCode>REG</ram:SubjectCode></ram:IncludedNote>\n' : '') +
    '    <ram:IncludedNote><ram:Content>Leistungszeitraum: ' + x(r.zeitraum_von.split('-').reverse().join('.') + ' - ' + r.zeitraum_bis.split('-').reverse().join('.')) + '</ram:Content></ram:IncludedNote>\n' +
    '  </rsm:ExchangedDocument>\n  <rsm:SupplyChainTradeTransaction>\n' + zeilen + '\n' +
    '    <ram:ApplicableHeaderTradeAgreement>\n      <ram:BuyerReference>' + x(r.leitweg_id || r.kundennummer || r.kunde) + '</ram:BuyerReference>\n' +
    partei('SellerTradeParty', e.firma_name, e.firma_strasse, e.firma_plz, e.firma_ort, e.firma_email, e.ust_id, e.steuernummer) +
    partei('BuyerTradeParty', r.kunde, r.anschrift, r.plz, r.ort, r.rechnung_email || r.kunde_email, r.kunde_ust_id, '') +
    (r.bestellnummer ? '      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>' + x(r.bestellnummer) + '</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>\n' : '') +
    '    </ram:ApplicableHeaderTradeAgreement>\n' +
    '    <ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">' + d102(r.zeitraum_bis) + '</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>\n' +
    '    <ram:ApplicableHeaderTradeSettlement>\n      <ram:PaymentReference>' + x(r.nummer) + '</ram:PaymentReference>\n      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>\n' +
    (e.iban ? '      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>' + x(String(e.iban).replace(/\s/g, '')) + '</ram:IBANID><ram:AccountName>' + x(e.firma_name) + '</ram:AccountName></ram:PayeePartyCreditorFinancialAccount>' +
      (e.bic ? '<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>' + x(e.bic) + '</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>' : '') + '</ram:SpecifiedTradeSettlementPaymentMeans>\n' : '') +
    '      <ram:ApplicableTradeTax><ram:CalculatedAmount>' + b(r.ust) + '</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>' + (kat === 'AE' ? '<ram:ExemptionReason>Steuerschuldnerschaft des Leistungsempfängers (§ 13b Abs. 2 Nr. 8 UStG)</ram:ExemptionReason>' : '') + '<ram:BasisAmount>' + b(r.netto) + '</ram:BasisAmount><ram:CategoryCode>' + kat + '</ram:CategoryCode>' + (kat === 'AE' ? '<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>' : '') + '<ram:RateApplicablePercent>' + b(satz) + '</ram:RateApplicablePercent></ram:ApplicableTradeTax>\n' +
    '      <ram:BillingSpecifiedPeriod><ram:StartDateTime><udt:DateTimeString format="102">' + d102(r.zeitraum_von) + '</udt:DateTimeString></ram:StartDateTime><ram:EndDateTime><udt:DateTimeString format="102">' + d102(r.zeitraum_bis) + '</udt:DateTimeString></ram:EndDateTime></ram:BillingSpecifiedPeriod>\n' +
    '      <ram:SpecifiedTradePaymentTerms><ram:Description>Zahlbar bis ' + x(String(r.faellig || '').split('-').reverse().join('.')) + ' ohne Abzug.</ram:Description>' + (r.faellig ? '<ram:DueDateDateTime><udt:DateTimeString format="102">' + d102(r.faellig) + '</udt:DateTimeString></ram:DueDateDateTime>' : '') + '</ram:SpecifiedTradePaymentTerms>\n' +
    '      <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>' + b(r.netto) + '</ram:LineTotalAmount><ram:TaxBasisTotalAmount>' + b(r.netto) + '</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">' + b(r.ust) + '</ram:TaxTotalAmount><ram:GrandTotalAmount>' + b(r.brutto) + '</ram:GrandTotalAmount><ram:DuePayableAmount>' + b(r.brutto) + '</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>\n' +
    (r.storno_nummer ? '      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>' + x(r.storno_nummer) + '</ram:IssuerAssignedID></ram:InvoiceReferencedDocument>\n' : '') +
    '    </ram:ApplicableHeaderTradeSettlement>\n  </rsm:SupplyChainTradeTransaction>\n</rsm:CrossIndustryInvoice>\n';
}

module.exports = { xml };
