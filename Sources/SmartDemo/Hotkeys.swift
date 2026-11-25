import AppKit
import Carbon

/// Global shortcuts through Carbon's RegisterEventHotKey (no Accessibility permission needed).
/// Letters are resolved through the *current keyboard layout*, so ⌃⌥A means the key labelled
/// "A" on an AZERTY keyboard too.
final class HotkeyCenter {
    static let shared = HotkeyCenter()
    private var handlers: [UInt32: () -> Void] = [:]
    private var refs: [EventHotKeyRef] = []
    private var nextID: UInt32 = 1
    private var installed = false

    static let ctrlOpt = UInt32(controlKey | optionKey)

    private func install() {
        guard !installed else { return }
        installed = true
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var hk = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &hk)
            let id = hk.id
            DispatchQueue.main.async { HotkeyCenter.shared.fire(id) }
            return noErr
        }, 1, &spec, nil, nil)
    }

    private func fire(_ id: UInt32) { handlers[id]?() }

    @discardableResult
    func register(key: String, modifiers: UInt32 = HotkeyCenter.ctrlOpt, _ handler: @escaping () -> Void) -> Bool {
        install()
        guard let code = HotkeyCenter.keyCode(for: key) else { return false }
        var ref: EventHotKeyRef?
        let id = nextID
        nextID += 1
        let status = RegisterEventHotKey(code, modifiers, EventHotKeyID(signature: OSType(0x464F_434C), id: id),
                                         GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref else { return false }
        refs.append(ref)
        handlers[id] = handler
        return true
    }

    func unregisterAll() {
        refs.forEach { UnregisterEventHotKey($0) }
        refs.removeAll()
        handlers.removeAll()
    }

    // Digits use physical top-row positions (on AZERTY they need Shift to type, but the key is the same).
    private static let digitCodes: [String: UInt32] = [
        "1": UInt32(kVK_ANSI_1), "2": UInt32(kVK_ANSI_2), "3": UInt32(kVK_ANSI_3), "4": UInt32(kVK_ANSI_4),
        "5": UInt32(kVK_ANSI_5), "6": UInt32(kVK_ANSI_6), "7": UInt32(kVK_ANSI_7), "8": UInt32(kVK_ANSI_8),
        "9": UInt32(kVK_ANSI_9), "0": UInt32(kVK_ANSI_0),
    ]

    private static let ansiLetters: [String: UInt32] = [
        "a": 0x00, "s": 0x01, "d": 0x02, "f": 0x03, "h": 0x04, "g": 0x05, "z": 0x06, "x": 0x07, "c": 0x08,
        "v": 0x09, "b": 0x0B, "q": 0x0C, "w": 0x0D, "e": 0x0E, "r": 0x0F, "y": 0x10, "t": 0x11, "o": 0x1F,
        "u": 0x20, "i": 0x22, "p": 0x23, "l": 0x25, "j": 0x26, "k": 0x28, "n": 0x2D, "m": 0x2E,
    ]

    private static var layoutCache: [String: UInt32]?

    static func keyCode(for key: String) -> UInt32? {
        let k = key.lowercased()
        if let d = digitCodes[k] { return d }
        if layoutCache == nil { layoutCache = layoutMap() }
        return layoutCache?[k] ?? ansiLetters[k]
    }

    private static func layoutMap() -> [String: UInt32] {
        var map: [String: UInt32] = [:]
        let source = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue()
        var dataPtr = source.flatMap { TISGetInputSourceProperty($0, kTISPropertyUnicodeKeyLayoutData) }
        if dataPtr == nil, let ascii = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?.takeRetainedValue() {
            dataPtr = TISGetInputSourceProperty(ascii, kTISPropertyUnicodeKeyLayoutData)
        }
        guard let ptr = dataPtr else { return map }
        let data = Unmanaged<CFData>.fromOpaque(ptr).takeUnretainedValue()
        guard let bytes = CFDataGetBytePtr(data) else { return map }
        let layout = UnsafeRawPointer(bytes).assumingMemoryBound(to: UCKeyboardLayout.self)
        for code in 0..<64 { // main keyboard block only (skip keypad)
            var dead: UInt32 = 0
            var chars = [UniChar](repeating: 0, count: 4)
            var len = 0
            let st = UCKeyTranslate(layout, UInt16(code), UInt16(kUCKeyActionDisplay), 0, UInt32(LMGetKbdType()),
                                    OptionBits(kUCKeyTranslateNoDeadKeysBit), &dead, 4, &len, &chars)
            if st == noErr, len > 0 {
                let s = String(utf16CodeUnits: chars, count: len).lowercased()
                if map[s] == nil { map[s] = UInt32(code) }
            }
        }
        return map
    }
}
