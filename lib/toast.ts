type ToastType = 'success' | 'error' | 'info';

type ToastPayload = {
  type: ToastType;
  message: string;
};

type Listener = (payload: ToastPayload) => void;

let _listener: Listener | null = null;

export function _registerToastListener(fn: Listener) {
  _listener = fn;
}

export function showToast(type: ToastType, message: string) {
  _listener?.({ type, message });
}
