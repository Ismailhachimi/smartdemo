import AppKit
import SwiftUI

// MARK: - "Connecter SmartDemo" window
//
// Two ways in:
// - Browser (default): opens <server>/connect, the user signs in and clicks "Autoriser", the page
//   hands the token back through smartdemo://connect (see AppDelegate.handleURLEvent).
// - Token: paste a personal access token created in the web app's settings.

@MainActor
final class ConnectModel: ObservableObject {
    enum Mode: Hashable { case browser, token }

    @Published var server: String
    @Published var token = ""
    @Published var mode: Mode = .browser
    @Published var busy = false
    @Published var waitingForBrowser = false
    @Published var error: String?
    @Published var connectedEmail: String?

    init(server: String) { self.server = server }

    var canSubmit: Bool {
        !busy && !server.trimmingCharacters(in: .whitespaces).isEmpty
            && (mode == .browser || !token.trimmingCharacters(in: .whitespaces).isEmpty)
    }
}

@MainActor
final class ConnectWindow {
    static let shared = ConnectWindow()

    /// Verifies a server + token pair, saves it and returns the account email.
    var connect: ((URL, String) async throws -> String)?

    private var window: NSWindow?
    private var model: ConnectModel?
    private var closeObserver: NSObjectProtocol?

    var isOpen: Bool { window != nil }

    func show(server: URL?) {
        NSApp.activate(ignoringOtherApps: true)
        if let window {
            window.makeKeyAndOrderFront(nil)
            return
        }
        let model = ConnectModel(server: server?.absoluteString ?? "")
        let view = ConnectView(
            model: model,
            primary: { [weak self] in self?.primaryAction() },
            cancel: { [weak self] in self?.close() }
        )
        let host = NSHostingController(rootView: view)
        host.sizingOptions = [.preferredContentSize]
        let w = NSWindow(contentViewController: host)
        w.styleMask = [.titled, .closable, .fullSizeContentView]
        w.titlebarAppearsTransparent = true
        w.titleVisibility = .hidden
        w.title = "Connecter SmartDemo"
        w.isMovableByWindowBackground = true
        w.isReleasedWhenClosed = false
        w.level = .floating
        w.center()
        closeObserver = NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: w, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.forget() }
        }
        window = w
        self.model = model
        w.makeKeyAndOrderFront(nil)
    }

    func close() {
        window?.close()
        forget()
    }

    /// The browser flow came back through smartdemo://connect.
    func didConnect(email: String) {
        guard let model else { return }
        model.waitingForBrowser = false
        model.error = nil
        model.connectedEmail = email
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    /// Shows a connection error in the window. Returns false when the window is closed.
    func didFail(_ message: String) -> Bool {
        guard let model else { return false }
        model.waitingForBrowser = false
        model.busy = false
        model.error = message
        return true
    }

    private func forget() {
        if let closeObserver { NotificationCenter.default.removeObserver(closeObserver) }
        closeObserver = nil
        window = nil
        model = nil
    }

    private func primaryAction() {
        guard let model else { return }
        if model.connectedEmail != nil { return close() }
        model.error = nil
        guard let url = CloudConfig.normalize(model.server) else {
            model.error = "Adresse invalide. Exemple : https://app.smartdemo.app"
            return
        }
        switch model.mode {
        case .browser:
            var c = URLComponents(url: url.appendingPathComponent("connect"), resolvingAgainstBaseURL: false)!
            c.queryItems = [URLQueryItem(name: "device", value: Host.current().localizedName ?? "Mac")]
            if let target = c.url { NSWorkspace.shared.open(target) }
            model.waitingForBrowser = true
        case .token:
            let token = model.token.trimmingCharacters(in: .whitespacesAndNewlines)
            model.busy = true
            Task { @MainActor in
                defer { model.busy = false }
                do {
                    guard let connect else { return }
                    let email = try await connect(url, token)
                    model.connectedEmail = email
                } catch {
                    model.error = error.localizedDescription
                }
            }
        }
    }
}

private struct ConnectView: View {
    @ObservedObject var model: ConnectModel
    let primary: () -> Void
    let cancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(alignment: .center, spacing: 14) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .frame(width: 52, height: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Connecter SmartDemo")
                        .font(.system(size: 17, weight: .semibold))
                    Text("Envoie tes enregistrements sur ton compte pour les partager par lien et voir qui les regarde.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if let email = model.connectedEmail {
                success(email)
            } else {
                form
            }

            HStack {
                Spacer()
                if model.connectedEmail == nil {
                    Button("Annuler", action: cancel)
                        .keyboardShortcut(.cancelAction)
                        .controlSize(.large)
                }
                Button(primaryTitle, action: primary)
                    .keyboardShortcut(.defaultAction)
                    .controlSize(.large)
                    .buttonStyle(.borderedProminent)
                    .disabled(model.connectedEmail == nil && !model.canSubmit)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 30)
        .padding(.bottom, 22)
        .frame(width: 440)
    }

    private var primaryTitle: String {
        if model.connectedEmail != nil { return "Terminé" }
        switch model.mode {
        case .browser: return model.waitingForBrowser ? "Rouvrir le navigateur" : "Continuer dans le navigateur"
        case .token: return model.busy ? "Connexion…" : "Connecter"
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 16) {
            field(
                "Serveur",
                hint: "L'adresse de ton espace SmartDemo, ou de ton propre serveur."
            ) {
                TextField("", text: $model.server, prompt: Text("https://app.smartdemo.app"))
                    .textFieldStyle(.roundedBorder)
                    .controlSize(.large)
                    .disableAutocorrection(true)
            }

            Picker("Méthode", selection: $model.mode) {
                Text("Avec le navigateur").tag(ConnectModel.Mode.browser)
                Text("Avec un token").tag(ConnectModel.Mode.token)
            }
            .pickerStyle(.segmented)
            .labelsHidden()

            Group {
                switch model.mode {
                case .browser:
                    if model.waitingForBrowser {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small)
                            Text("Valide la connexion dans ton navigateur. Cette fenêtre se mettra à jour toute seule.")
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } else {
                        Text("Ton navigateur s'ouvre sur le serveur : connecte-toi si besoin, puis clique sur « Autoriser ». Recommandé.")
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                case .token:
                    field("Token", hint: "Sur le serveur : Réglages → Créer un token.") {
                        SecureField("", text: $model.token, prompt: Text("sd_…"))
                            .textFieldStyle(.roundedBorder)
                            .controlSize(.large)
                    }
                }
            }
            .font(.system(size: 12))
            .frame(minHeight: 44, alignment: .topLeading)

            if let error = model.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func success(_ email: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 26))
                .foregroundStyle(.green)
            VStack(alignment: .leading, spacing: 2) {
                Text("Connecté").font(.system(size: 13, weight: .semibold))
                Text("\(email) · \(CloudConfig.normalize(model.server)?.host ?? model.server)")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                Text("Partage → Envoyer la dernière vidéo pour partager un enregistrement.")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
                    .padding(.top, 4)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.green.opacity(0.08)))
    }

    private func field<Content: View>(_ label: String, hint: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12, weight: .medium))
            content()
            Text(hint).font(.system(size: 11)).foregroundStyle(.secondary)
        }
    }
}
