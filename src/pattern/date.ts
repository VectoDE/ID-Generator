import { ConfigurationError } from '../errors.js';
import { escapeRegExp } from './regex.js';

const FORMAT_PARTS = /YYYY|YY|MM|DD|HH|mm|ss|SSS/g;
const ALLOWED_FORMAT = /^(?:YYYY|YY|MM|DD|HH|mm|ss|SSS|[^A-Za-z])+$/;

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

const fields = (date: Date, utc: boolean) =>
  utc
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
        milliseconds: date.getUTCMilliseconds(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: date.getSeconds(),
        milliseconds: date.getMilliseconds(),
      };

/** Rejects formats with letters other than the supported placeholders, so typos do not end up in IDs. */
export const assertDateFormat = (format: string): string => {
  if (!ALLOWED_FORMAT.test(format)) {
    throw new ConfigurationError(
      'INVALID_PATTERN',
      `Unsupported date format "${format}". Use YYYY, YY, MM, DD, HH, mm, ss, SSS and separators.`,
      { format }
    );
  }
  return format;
};

/** Formats a date with YYYY, YY, MM, DD, HH, mm, ss and SSS; any other character is kept as is. */
export const formatDate = (date: Date, format: string, utc: boolean): string => {
  const parts = fields(date, utc);
  return assertDateFormat(format).replaceAll(FORMAT_PARTS, (part) => {
    switch (part) {
      case 'YYYY':
        return pad(parts.year, 4);
      case 'YY':
        return pad(parts.year % 100, 2);
      case 'MM':
        return pad(parts.month, 2);
      case 'DD':
        return pad(parts.day, 2);
      case 'HH':
        return pad(parts.hours, 2);
      case 'mm':
        return pad(parts.minutes, 2);
      case 'ss':
        return pad(parts.seconds, 2);
      default:
        return pad(parts.milliseconds, 3);
    }
  });
};

/** Regular expression source matching the output of {@link formatDate} for this format. */
export const dateFormatMatcher = (format: string): string =>
  escapeRegExp(assertDateFormat(format)).replaceAll(FORMAT_PARTS, (part) => String.raw`\d{${part.length}}`);
