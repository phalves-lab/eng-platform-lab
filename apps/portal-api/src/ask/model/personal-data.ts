const STUDENT_ID = /\bRA[\s:.#-]{0,3}\d{9}(?![\w-])/gi
const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g
const CPF = /(?<![\w.-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\w-])/g
const PHONE_WITH_AREA = /(?<![\w(+])(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\w)/g
const LOCAL_PHONE = /(?<![\w-])9?\d{4}-\d{4}(?![\w-])/g
const CARD_PATTERNS = [
  /(?<![\w.-])\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{1,3})?(?![\w-])/g,
  /(?<![\w.-])\d{4}[ -]\d{6}[ -]\d{5}(?![\w-])/g,
  /(?<![\w.-])\d{13,19}(?![\w-])/g,
]

const passesLuhn = (digits: string) => {
  let sum = 0
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index])
    if (index % 2 === 1) digit = digit * 2 > 9 ? digit * 2 - 9 : digit * 2
    sum += digit
  }
  return sum % 10 === 0
}

/** Long numbers count as card numbers only when their check digit is valid (Luhn). */
const maskCards = (text: string) =>
  CARD_PATTERNS.reduce(
    (masked, pattern) =>
      masked.replace(pattern, (match) =>
        passesLuhn(match.replace(/\D/g, '')) ? '[cartão]' : match,
      ),
    text,
  )

/**
 * Masks student IDs in the lab format (RA followed by 9 digits), e-mail addresses, CPFs,
 * Brazilian phone numbers and card numbers before text leaves for the model or is stored.
 */
export const maskPersonalData = (text: string) =>
  maskCards(text.replace(STUDENT_ID, '[RA]').replace(EMAIL, '[e-mail]'))
    .replace(CPF, '[CPF]')
    .replace(PHONE_WITH_AREA, '[telefone]')
    .replace(LOCAL_PHONE, '[telefone]')
