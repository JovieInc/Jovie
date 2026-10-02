export type DesktopAuthOpenState = 'idle' | 'opening' | 'opened' | 'error';
export type CopyState = 'idle' | 'copying' | 'copied' | 'error';
export type RedeemState = 'idle' | 'redeeming' | 'redeemed' | 'error';
export type TouchIdState = 'idle' | 'working' | 'signed-in' | 'error';
export type SelectedMethod = 'touch-id' | 'browser' | 'code' | 'qr';

const RETURN_CODE_LENGTH = 8;

export function isCompleteReturnCode(value: string): boolean {
  return value.replace('-', '').length === RETURN_CODE_LENGTH;
}
