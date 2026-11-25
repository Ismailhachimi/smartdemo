import AppKit
import AVFoundation
import Security

// MARK: - Server connection (optional, self-hostable — see web/)
//
// Recordings always stay on this Mac. They are only sent to the configured server when the
// user asks ("Envoyer la dernière vidéo") or enables automatic upload.

/// API token storage in the login keychain.
enum Keychain {
    private static let service = "app.smartdemo.recorder"

    static func get(_ account: String) -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func set(_ account: String, _ value: String?) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }
}

final class CloudConfig {
    static let shared = CloudConfig()
    private let d = UserDefaults.standard

    /// Base URL of the SmartDemo server, e.g. https://smartdemo.example.com
    var serverURL: URL? {
        get { d.string(forKey: "serverURL").flatMap(URL.init(string:)) }
        set { d.set(newValue?.absoluteString, forKey: "serverURL") }
    }
    var token: String? {
        get { Keychain.get("api-token") }
        set { Keychain.set("api-token", newValue) }
    }
    var account: String? {
        get { d.string(forKey: "serverAccount") }
        set { d.set(newValue, forKey: "serverAccount") }
    }
    var autoUpload: Bool {
        get { d.bool(forKey: "autoUpload") }
        set { d.set(newValue, forKey: "autoUpload") }
    }
    var lastRecording: URL? {
        get { d.string(forKey: "lastRecording").map { URL(fileURLWithPath: $0) }.flatMap { FileManager.default.fileExists(atPath: $0.path) ? $0 : nil } }
        set { d.set(newValue?.path, forKey: "lastRecording") }
    }
    var isConnected: Bool { serverURL != nil && token != nil }

    func disconnect() {
        token = nil
        serverURL = nil
        account = nil
    }

    /// Accepts "smartdemo.example.com", "http://localhost:8080/", "https://x.y/videos"… and keeps scheme + host + port.
    static func normalize(_ raw: String) -> URL? {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.contains("://") { s = (s.hasPrefix("localhost") || s.hasPrefix("127.") ? "http://" : "https://") + s }
        guard let u = URLComponents(string: s), let scheme = u.scheme, let host = u.host, ["http", "https"].contains(scheme) else { return nil }
        var c = URLComponents()
        c.scheme = scheme
        c.host = host
        c.port = u.port
        return c.url
    }
}

struct UploadResult {
    let shareURL: String
    let dashboardURL: String
}

enum CloudError: LocalizedError {
    case notConnected, unauthorized, server(String), network(String)
    var errorDescription: String? {
        switch self {
        case .notConnected: return "Aucun serveur connecté."
        case .unauthorized: return "Token refusé par le serveur. Reconnecte l'app depuis les réglages du serveur."
        case .server(let m): return m
        case .network(let m): return "Serveur injoignable : \(m)"
        }
    }
}

final class CloudClient: NSObject, URLSessionTaskDelegate {
    static let shared = CloudClient()
    private let config = CloudConfig.shared
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    private var progressHandlers: [Int: (Double) -> Void] = [:]
    private let lock = NSLock()
    private(set) var isUploading = false

    private func request(_ path: String, server: URL? = nil, token: String? = nil, method: String = "GET") throws -> URLRequest {
        guard let base = server ?? config.serverURL, let tok = token ?? config.token else { throw CloudError.notConnected }
        var r = URLRequest(url: base.appendingPathComponent("api").appendingPathComponent(path))
        r.httpMethod = method
        r.setValue("Bearer \(tok)", forHTTPHeaderField: "Authorization")
        return r
    }

    private func check(_ data: Data, _ response: URLResponse) throws -> [String: Any] {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if status == 401 { throw CloudError.unauthorized }
        guard (200..<300).contains(status) else {
            throw CloudError.server(json["message"] as? String ?? "Erreur serveur (\(status)).")
        }
        return json
    }

    /// Checks a server + token pair and returns the account email.
    func verify(server: URL, token: String) async throws -> String {
        let r = try request("auth/me", server: server, token: token)
        do {
            let (data, res) = try await session.data(for: r)
            let json = try check(data, res)
            return (json["user"] as? [String: Any])?["email"] as? String ?? server.host ?? ""
        } catch let e as CloudError {
            throw e
        } catch {
            throw CloudError.network(error.localizedDescription)
        }
    }

    /// Uploads a recording, then its poster frame. Returns the share link.
    func upload(_ file: URL, server: URL? = nil, token: String? = nil, progress: @escaping (Double) -> Void) async throws -> UploadResult {
        isUploading = true
        defer { isUploading = false }
        let asset = AVURLAsset(url: file)
        let duration = (try? await asset.load(.duration)).map(CMTimeGetSeconds) ?? 0
        var size = CGSize.zero
        if let track = try? await asset.loadTracks(withMediaType: .video).first {
            size = (try? await track.load(.naturalSize)) ?? .zero
        }

        var r = try request("videos", server: server, token: token, method: "POST")
        var comps = URLComponents(url: r.url!, resolvingAgainstBaseURL: false)!
        var query = [URLQueryItem(name: "title", value: file.deletingPathExtension().lastPathComponent)]
        if duration > 0 { query.append(URLQueryItem(name: "durationSec", value: String(format: "%.2f", duration))) }
        if size.width > 0 {
            query.append(URLQueryItem(name: "width", value: String(Int(size.width))))
            query.append(URLQueryItem(name: "height", value: String(Int(size.height))))
        }
        comps.queryItems = query
        r.url = comps.url
        r.setValue(file.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4", forHTTPHeaderField: "Content-Type")
        r.timeoutInterval = 3600

        let json: [String: Any]
        do {
            let (data, res): (Data, URLResponse) = try await withCheckedThrowingContinuation { cont in
                let t = session.uploadTask(with: r, fromFile: file) { data, res, err in
                    if let err { cont.resume(throwing: err) } else { cont.resume(returning: (data ?? Data(), res!)) }
                }
                lock.withLock { progressHandlers[t.taskIdentifier] = progress }
                t.resume()
            }
            json = try check(data, res)
        } catch let e as CloudError {
            throw e
        } catch {
            throw CloudError.network(error.localizedDescription)
        }

        let videoID = (json["video"] as? [String: Any])?["id"] as? String
        if let videoID, let jpeg = await posterJPEG(asset, at: duration) {
            if var t = try? request("videos/\(videoID)/thumbnail", server: server, token: token, method: "PUT") {
                t.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
                _ = try? await session.upload(for: t, from: jpeg)
            }
        }
        return UploadResult(
            shareURL: json["shareUrl"] as? String ?? "",
            dashboardURL: json["dashboardUrl"] as? String ?? config.serverURL?.absoluteString ?? ""
        )
    }

    private func posterJPEG(_ asset: AVURLAsset, at duration: Double) async -> Data? {
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: 1280, height: 1280)
        let t = CMTime(seconds: min(1.0, max(0, duration / 2)), preferredTimescale: 600)
        guard let cg = try? await gen.image(at: t).image else { return nil }
        return NSBitmapImageRep(cgImage: cg).representation(using: .jpeg, properties: [.compressionFactor: 0.82])
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        let handler = lock.withLock { progressHandlers[task.taskIdentifier] }
        handler?(Double(totalBytesSent) / Double(totalBytesExpectedToSend))
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.withLock { _ = progressHandlers.removeValue(forKey: task.taskIdentifier) }
    }
}
