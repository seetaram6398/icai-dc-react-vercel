/**
 * Rule 5(5) defect catalogue used by the Scrutiny Officer when a complaint is
 * returned to the complainant. The communication text is the approved draft
 * from the Disciplinary Directorate's "discrepancies and relevant
 * communication" workbook. Keep this list in sync with that workbook.
 */
const DEFECTS = [
  {
    "code": "1",
    "label": "Authorization letter/Board Resolution not submitted",
    "communication": "",
    "relevantColumn": "Authorization Letter input"
  },
  {
    "code": "56",
    "label": "Authorization letter/Board Resolution not submitted – Central/State Government (Rule 3(2))",
    "communication": "As per Rule 3(2) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007, A Complaint filed by or on behalf of the Central Government or any State Government, shall be authorized by an officer holding a post not below the rank of a Joint Secretary or equivalent and shall be signed by an officer holding a post not below the rank of an Under Secretary or equivalent in the Central or State Government, as the case may be.” Accordingly, you are requested to submit an authorization in your favour made by an officer holding a post not below the rank of a Joint Secretary or equivalent to file the instant complaint with the Institute against the aforesaid Member.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "58",
    "label": "Authorization letter/Board Resolution not submitted – Statutory Authority (Rule 3(3))",
    "communication": "As per Rule 3(3) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007, “A Complaint filed by or on behalf of any statutory authority, such as Reserve Bank of India or Securities  and Exchange Board of India, shall be authorized by an officer holding a post equivalent to the post of Joint Secretary in the Government of India and shall be signed by an officer holding a post not below the rank of an under Secretary or equivalent in the Central or State Government, as the case may be.”\r\n\r\n\tOn perusal of your complaint, it is not clear whether the rank of ______________ is equivalent to the rank of Joint Secretary or not. Accordingly, you are requested to make it clear whether the rank of signatory to the complaint is equivalent to that of Joint Secretary. If not, an authorization in favour of the Complainant made by an officer holding a post not below the rank of a Joint Secretary or equivalent to file the instant complaint be submitted, within 15 days of receipt of this letter.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "60",
    "label": "Authorization letter/Board Resolution not submitted – Bank General Resolution/Power of Attorney (Rule 3(4))",
    "communication": "The Authorisation letter has not been submitted by you, as per the requirement of Rule 3(4) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007.  Since, you are filing this complaint as ___________________ of ___________Bank, you are requested to submit certified true copy of the General Resolution or Power of Attorney, authorising you to file complaint on behalf of ___________________Bank.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "62",
    "label": "Authorization letter/Board Resolution not submitted – Company Board Resolution (Rule 3(4))",
    "communication": "You have not submitted the Authorisation letter/Board Resolution as per the requirement of Rule 3(4) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007. Since, you are filing the complaint on behalf of  M/s _____________________, a resolution/authorization duly passed by the Board of Directors or a certified copy of the extract of such resolution duly signed by the authorized Director or Company Secretary of the Company, specifically authorising you to file the instant complaint with the Institute against the aforesaid firm on behalf of M/s_______________ and also specifically authorise you to sign all documents, forms, papers, application etc. related to instant complaint and to appear before the ICAI or any of its Committees is required to be submitted to this office. (IN ORIGINAL) Or else, if you want to file this complaint in your individual capacity, you may kindly submit a clarification in this regard.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "64",
    "label": "Authorization letter/Board Resolution not submitted – Firm Partner Authorization (Rule 3(4))",
    "communication": "You have not submitted the Authorisation letter/Board Resolution as per the requirement of Rule 3(4) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007. Since, you are filing the complaint as a partner of firm, a  resolution/authorization duly passed by all partners, specifically authorising you to file the instant complaint with the Institute against the aforesaid firm on behalf of complainat firm, is required to be submitted to this office. (IN ORIGINAL) Or else, if you want to file this complaint in your individual capacity, you may submit a clarification in this regard.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "66",
    "label": "Authorization letter/Board Resolution not submitted – Trust Managing Committee Resolution (Rule 3(4))",
    "communication": "You have not submitted the Resolution as per the requirement of Rule 3(4) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007. Since, you are filing the complaint on behalf of M/s_________________, a resolution duly passed by the Managing Committee of the Trust, specifically authorising you to file the instant complaint with the Institute against the aforesaid member on behalf of M/s _____________________ and also specifically authorise you to sign all documents, forms, papers, application etc. related to instant complaint and to appear before the ICAI or any of its Committees is required to be submitted to this office. (IN ORIGINAL) Or else, if you want to file this complaint in your individual capacity, you may kindly submit a clarification in this regard.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "2",
    "label": "Form I is against member and resolution is against the firm",
    "communication": "Form ‘I’ dated ___________ submitted by you is to file a complaint against the member, however authorization letter/Board Resolution submitted by you is to file complaint against the firm. In this regard, you are requested to either submit revised Form ‘I’ (in triplicate) against the firm, originally signed and verified by you as on current date OR submit revised authorization letter/Board Resolution to file the instant complaint against the member.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "3",
    "label": "Name of Complainant not mentioned in Column No. 1 of Form 'I'",
    "communication": "The name of the person, who is filing the complaint in Form `I’ is required to be mentioned in Column (1) and the same is required to be verified by him mentioning his name and signature.",
    "relevantColumn": "Column 1 of Form I and verification part"
  },
  {
    "code": "4",
    "label": "Form I submitted by multiple complainants  but signed & verified by only one complainant",
    "communication": "In Column 1 of Form ‘I’, you have mentioned name of more than one Complainant, however the complaint Form ‘I’ has been signed and verified by only one complainant. In this regard, we wish to inform that if you want to file complaint jointly, then all co-complainants are required to sign and verify complaint Form ‘I’ as on current date with name of all co-complainants on verification part. OR else, if you want to proceed this complaint individually, then you are required to mention your name only in column 1 (and remove name of co-complainant from column 1) and on verification part and resubmit the same in triplicate originally signed and verified by you as on current date and also on the portal’ .",
    "relevantColumn": "Column 1 of Form I"
  },
  {
    "code": "5",
    "label": "Wrong membership number mentioned in Column no. 2",
    "communication": "You have wrongly mentioned membership number of member in Column no. 2 of Form I. You are requested to mention correct membership number in Column 2 and resubmit the same in triplicate originally signed and verified by you as on current date  and also on the portal’.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "6",
    "label": "Correct details of member/firm not provided",
    "communication": "The member could not be identified on the basis of particulars provided by you. You are requested to submit some more details/information of member e.g. date of birth, membership number, contact number, correct professional or residential address, father’s name etc. so as to enable us to initiate complaint against correct member. Please note that the disciplinary jurisdiction under chapter V of the Chartered Accountants Act, 1949 can be exercised only against a Chartered Accountant or a Firm registered with the Institute.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "7",
    "label": "Complaint against more than one member in single complaint Form I",
    "communication": "In Column (2) of Form ‘I’, you have mentioned the names of more than one member. You are hereby informed that complaint against each individual firm/member is required to be submitted in a separate set of Form ‘I’ alongwith separate/specific allegations and separate documentary evidences in triplicate and a separate complaint fee of Rs. 2950/-. You are, therefore, requested to resubmit the complaint/s (originally signed and verified on current date) against each member separately alongwith separate documentary evidences and charges in triplicate and a separate complaint fee of Rs. 2950/- to substantiate your complaint and which you want to make part of your complaint.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "8",
    "label": "Complain Form I against entity, not against member or firm",
    "communication": "In Column ‘2’ of Form I, you have mentioned name of member alongwith name of entity and name of its Director, who is not a Chartered Accountant. In this regard, we wish to inform you that the Directorate can process the complaint only against a Chartered Accountant or a firm registered with the Institute. Therefore, you are requested to kindly rectify Column ‘2’ of Form ‘I’ and mention the name and membership number of only member registered with the Institute.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "9",
    "label": "Details of partner and partnership firm mentioned in Column no. 2",
    "communication": "In Column No. 2 of Form ‘I’, you have mentioned the name and membership number of member alongwith name and registration number of CA firm. It is clarified that complaint against individual firm/member is required to be submitted in a separate set of Form ‘I’ alongwith separate documentary evidences in triplicate and separate complaint fee of Rs. 2950/-. Accordingly, in case, the complaint is made against the individual member, the details of firm from Column No. 2 of Form ‘I’ be removed.\r\n\r\nOr in the alternate, you may file the complaint against the firm (mentioning the name of the firm only in Column No. 2), which in turn, would be asked to disclose the name/s of member/s answerable in the matter. Therefore, you are requested to resubmit the complaint in Form ‘I’ in triplicate originally signed & verified by you as on current date and also on the portal’.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "10",
    "label": "Details of proprietor & proprietorship firm mentioned in Column no. 2",
    "communication": "In Column No. 2 of Form ‘I’, you have mentioned the name and membership number of member along with name and registration number of CA firm. In this context, you are requested to clarify whether you wish to proceed this matter against the proprietor/individual member or against the proprietorship firm.",
    "relevantColumn": "Column 2 of Form I"
  },
  {
    "code": "11",
    "label": "Column No. 3 left blank",
    "communication": "Column (3) of Form ‘I’ submitted by you has  been left blank. You are, therefore, requested to mention your communication address in Column (3) of Form ‘I’ and resubmit the same in Triplicate and also on the portal.",
    "relevantColumn": "Column 3 of Form I"
  },
  {
    "code": "12",
    "label": "Professional address of member/firm mentioned in Column no. 3",
    "communication": "In Column no. 3 of Form ‘I’, you have wrongly mentioned address of the member/firm instead of mentioning your communication address in said column. You are requested to mention your communication address in Column (3) of Form ‘I’ and professional address of member in Column 4 of Form ‘I’ and resubmit the same in Triplicate originally signed & verified by you as on current date  and also on the portal .",
    "relevantColumn": "Column 3 of Form I"
  },
  {
    "code": "13",
    "label": "Column No. 4 left blank",
    "communication": "In Column (4) of Form ‘I’, you have not mentioned professional address of member/firm against whom you want to register your complaint. Accordingly, you are requested to make necessary corrections in your complaint and submit the same in Triplicate  and also on the portal.",
    "relevantColumn": "Column 4 of Form I"
  },
  {
    "code": "14",
    "label": "Charges not mentioned in Column no. 5",
    "communication": "The statement of facts narrating the events that led to the filing of the instant complaint and specific charges against the CA firm/member, which is addressed to the Institute, is not found attached with a complaint submitted by you. You are, therefore, requested to submit detailed and specific charges against member/firm with sequence of events and period of misconduct, duly signed by you and also efile the certified copy of the same on the portal , so as to enable us to treat it as part of your complaint.",
    "relevantColumn": "Column 5 of Form I"
  },
  {
    "code": "15",
    "label": "Documents not submitted as per Column no. 6",
    "communication": "You have not submitted any documentary evidences as mentioned under column no. 6 of your complaint, in Form ‘I’, to substantiate the allegations made by you against the aforesaid member. Accordingly, you are requested to submit the same, in triplicate, duly certified by you as ‘True Copy’ with serially numbered and also efile the certified copy of the same on the portal .",
    "relevantColumn": "Column 6 of Form I"
  },
  {
    "code": "16",
    "label": "Documents not legible",
    "communication": "Page no. ____ submitted by you is not legible. You are requested to submit legible copy of the same in triplicate and also efile the certified copy of the same on the portal .",
    "relevantColumn": "Column 6 of Form I"
  },
  {
    "code": "17",
    "label": "Evdences submitted are not as per list of evidences provided by complainant",
    "communication": "Document no. _____ as mentioned by you in Column ‘6’ of Form I are not found enclosed with annexures received. You are, therefore, requested to provide a copy of the same in triplicate duly certified by you as ‘True Copy’ and also efile the certified copy of the same on the portal .",
    "relevantColumn": "Column 6 of Form I"
  },
  {
    "code": "18",
    "label": "Column No. 7 Left blank",
    "communication": "In Column 7 of Form ‘I’, you have not mentioned names of persons who have knowledge of the facts of the case. Accordingly, you are requested to mention the same in Column 7 of Form ‘I’ and resubmit the same in Triplicate as on current date and also on the portal .",
    "relevantColumn": "Column 7 of Form I"
  },
  {
    "code": "19",
    "label": "Name of Complainant not mentioned on verification part",
    "communication": "The name of the person, who is signing the complaint in Form `I’ is required to be mentioned in verification portion.  Accordingly, you are requested to mention your name at verification portion and resubmit the same in triplicate originally signed and verified by you as on current date.",
    "relevantColumn": "verification part"
  },
  {
    "code": "20",
    "label": "Verification portion missing",
    "communication": "The verification portion of the complaint Form ‘I’, has not been specified by you. You are requested to sign and verify the same as on the current date at the place provided in the complaint Form ‘I’ and resubmit the same in triplicate. Please note that all three dates including verification date must be same.",
    "relevantColumn": "verification part"
  },
  {
    "code": "21",
    "label": "Date, place & signature blank",
    "communication": "The columns provided for date, place and signature in the complaint Form ‘I’ (i.e. above & below verification part) have been left blank.  You are requested to resubmit the complaint in Form ‘I’, in triplicate, duly filled, signed and verified by you as on the current date. Please note that all three dates including verification date must be same.",
    "relevantColumn": "Others"
  },
  {
    "code": "22",
    "label": "Different signatures on Form I",
    "communication": "On perusal of signature columns above and below verification part of Form ‘I’, it is observed that both are apparently different. You, being a Complainant, are requested to sign and verify complaint Form ‘I’ with same signatures and resubmit the same as on current date.",
    "relevantColumn": "Signature portion (above & below verification)"
  },
  {
    "code": "23",
    "label": "Form I signed back dated",
    "communication": "The Complaint Form ‘I’ dated ______________ submitted by you is not as on current date. You are requested to submit revised Form ‘I’ in triplicate duly filled, originally signed and verified by you as on current date. Please note that all three dates including verification date must be same.",
    "relevantColumn": "Others"
  },
  {
    "code": "24",
    "label": "Form I is on letter head of company or firm",
    "communication": "You have submitted your complaint in Form ‘I’ on the letter head of your firm whereas the same is required to be submitted on plain paper and not on letter head. Therefore, you are requested to resubmit your complaint in Form ‘I’ in Triplicate (without any letter head) originally signed and verified by you as on current date.",
    "relevantColumn": "Others"
  },
  {
    "code": "25",
    "label": "Form I is not originally signed",
    "communication": "The complaint Form ‘I’ submitted by you is not in original. You are requested to submit revised Form ‘I’ in triplicate (after making necessary corrections) duly filled, originally signed (with blue ink pen) and verified by you as on current date. Kindly note that all three dates including verification date must be same.",
    "relevantColumn": "Signature portion (above & below verification)"
  },
  {
    "code": "26",
    "label": "Complaint fee not submitted",
    "communication": "You have not submitted complaint fee of Rs. 2,950/- (Rs.2500/- plus GST @ 18% i.e. Rs.450/-) alongwith your complaint in Form ‘I’. You are, therefore requested to submit the same through the below mentioned payment gateway link and send us your remittance details through e mail:\r\n\t\r\nhttps://easypay.axis.bank.in/easyPay/makePayment?mid=NDIzNjY%3D \r\n\r\nWhile it is advisable to make your payment through the above gateway mode, however in case, if you are not able to make the payment online due to unavoidable circumstances, you may make the payment ONLY through demand Draft in favour of “The Institute of Chartered Accountants of India” payable at New Delhi.",
    "relevantColumn": "separate window for fee submission, not available on Form I"
  },
  {
    "code": "27",
    "label": "Form I not in prescribed format",
    "communication": "Your aforementioned complaint is not in Form ‘I’ (copy enclosed) prescribed under the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007. Since format of Form ‘I’ is prescribed under the said Rules, no modifications thereof is permissible.",
    "relevantColumn": "Others"
  },
  {
    "code": "28",
    "label": "Evidences in pen drive, transcripts not submitted",
    "communication": "As the Disciplinary Directorate is neither acquainted nor familiar with the voices of the parties or any third party involved in the conversation that was captured in the audio clippings, the Disciplinary Directorate cannot ascertain/identify/segregate or correlate such voices. In the absence of clarity of persons involved in these audio clippings, it would not be possible for the Directorate to consider the same as evidence. \r\nAccordingly, you are requested to provide true copy of verbatim/transcriptions of these audio clippings alongwith names of persons involved in triplicate, within 10 days of receipt of this letter.",
    "relevantColumn": "Column 6 of Form I"
  },
  {
    "code": "29",
    "label": "Evidences submitted are in Regional language",
    "communication": "Certain documents submitted by you are in Regional language. You are requested to submit English translation of the same in triplicate duly certified by you as ‘True Copy’.\r\n\t\r\nBeing the Complainant, it is incumbent on you to provide the English/Hindi version of the documents for better appreciation of the facts and documents in correct perspective, in the absence of which we are constrained to proceed further in the matter and the same would be placed before the competent authority under Rule 5(6) of the Chartered Accountants (Procedure of Investigations of Professional and Other Misconduct and Conduct of Cases) Rules, 2007.",
    "relevantColumn": "Column 6 of Form I"
  },
  {
    "code": "30",
    "label": "Evidences submitted are in CD",
    "communication": "CD submitted by you cannot be taken on record as it is highly susceptible to damages, scratches and data loss. As the Directorate upon registration of complaint is required to forward a copy of complaint along with the documents to the Respondent, the risk of CD becoming nonfunctional is substantial and the same is returned herewith. Accordingly, you are requested to send us the duly signed letter containing specific allegations/charges along with the supporting documents/evidences in hard copy in triplicate. However, you may submit the contents of CD in a pen drive.",
    "relevantColumn": "Column 6 of Form I"
  }
];

const BY_CODE = new Map(DEFECTS.map((d) => [String(d.code), d]));

function getDefects() {
  return DEFECTS;
}

function findDefect(code) {
  return BY_CODE.get(String(code)) || null;
}

function buildDefectCommunication(codes, customDefects) {
  const selected = [
    ...(codes || []).map((code) => findDefect(code)).filter(Boolean),
    ...(customDefects || []),
  ];
  return selected
    .map((d, i) => {
      const communication = String(d.communication || '').trim();
      const column = String(d.relevantColumn || '').trim();
      return [
        `${i + 1}. ${d.label}`,
        column ? `Relevant column: ${column}` : '',
        communication || 'Please submit the required information/document for the above defect.',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

module.exports = { DEFECTS, getDefects, findDefect, buildDefectCommunication };
