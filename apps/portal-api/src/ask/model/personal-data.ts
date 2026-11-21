const EMAIL = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g
const CPF = /(?<![\w.-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\w-])/g
const PHONE_WITH_AREA = /(?<![\w(+])(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\w)/g
const LOCAL_PHONE = /(?<![\w-])9?\d{4}-\d{4}(?![\w-])/g

/** Masks e-mail addresses, CPFs and Brazilian phone numbers before text leaves for the model. */
export const maskPersonalData = (text: string) =>
  text
    .replace(EMAIL, '[e-mail]')
    .replace(CPF, '[CPF]')
    .replace(PHONE_WITH_AREA, '[telefone]')
    .replace(LOCAL_PHONE, '[telefone]')
