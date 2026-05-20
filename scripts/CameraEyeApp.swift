import Foundation
import AVFoundation
import AppKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers

final class CameraEye: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let requestPath = "/Users/neal/codex260303/tmp/camera-eye/request.json"
    private var session: AVCaptureSession?
    private var mode = "capture-frame"
    private var outputPath = "/Users/neal/codex260303/tmp/camera-eye/camera-eye.png"
    private var cameraName: String?
    private var duration: Double = 3
    private var pixelThreshold = 24
    private var ratioThreshold = 0.005
    private var firstFrame: CGImage?
    private var lastFrame: CGImage?
    private var lastPixels: [UInt8]?
    private var frameCount = 0
    private var maxChangedRatio = 0.0
    private var maxMeanDiff = 0.0
    private let ciContext = CIContext()
    private let queue = DispatchQueue(label: "camera-eye.output")

    func run() {
        loadRequest()
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                if !granted {
                    self.finish(status: "unauthorized")
                    return
                }
                self.startCapture()
            }
        }
        RunLoop.main.run()
    }

    private func loadRequest() {
        guard
            let data = FileManager.default.contents(atPath: requestPath),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        mode = obj["mode"] as? String ?? mode
        outputPath = obj["output"] as? String ?? outputPath
        cameraName = obj["cameraName"] as? String
        duration = obj["duration"] as? Double ?? duration
        pixelThreshold = obj["pixelThreshold"] as? Int ?? pixelThreshold
        ratioThreshold = obj["ratioThreshold"] as? Double ?? ratioThreshold
    }

    private func listDevices() -> [AVCaptureDevice] {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.external, .continuityCamera, .builtInWideAngleCamera],
            mediaType: .video,
            position: .unspecified
        )
        return discovery.devices
    }

    private func selectDevice() -> AVCaptureDevice? {
        let devices = listDevices()
        if let cameraName {
            return devices.first { $0.localizedName == cameraName || $0.localizedName.contains(cameraName) }
        }
        return devices.first
    }

    private func startCapture() {
        guard let device = selectDevice() else {
            finish(status: "device-not-found")
            return
        }
        let session = AVCaptureSession()
        session.beginConfiguration()
        session.sessionPreset = .high
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else {
                finish(status: "cannot-add-input")
                return
            }
            session.addInput(input)
        } catch {
            finish(status: "input-error: \(error.localizedDescription)")
            return
        }

        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        output.setSampleBufferDelegate(self, queue: queue)
        output.alwaysDiscardsLateVideoFrames = true
        guard session.canAddOutput(output) else {
            finish(status: "cannot-add-output")
            return
        }
        session.addOutput(output)
        session.commitConfiguration()

        self.session = session
        session.startRunning()

        if mode == "watch-motion" {
            Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { _ in
                self.finishWatch()
            }
        }
    }

    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ciImage = CIImage(cvImageBuffer: pixelBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }

        if mode == "capture-frame" {
            saveImage(cgImage, to: outputPath)
            finish(status: "ok")
            return
        }

        if mode == "watch-motion" {
            frameCount += 1
            if firstFrame == nil {
                firstFrame = cgImage
                saveImage(cgImage, to: outputPath + ".first.png")
            }
            lastFrame = cgImage
            let pixels = rgbaBytes(from: cgImage)
            if let prev = lastPixels {
                let (changedRatio, meanDiff) = compare(prev, pixels)
                maxChangedRatio = max(maxChangedRatio, changedRatio)
                maxMeanDiff = max(maxMeanDiff, meanDiff)
            }
            lastPixels = pixels
        }
    }

    private func rgbaBytes(from image: CGImage) -> [UInt8] {
        let bytesPerPixel = 4
        let bytesPerRow = image.width * bytesPerPixel
        var data = [UInt8](repeating: 0, count: image.height * bytesPerRow)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let context = CGContext(
            data: &data,
            width: image.width,
            height: image.height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )!
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return data
    }

    private func compare(_ a: [UInt8], _ b: [UInt8]) -> (Double, Double) {
        let pixels = min(a.count, b.count) / 4
        var changed = 0
        var totalDiff = 0
        for i in stride(from: 0, to: pixels * 4, by: 4) {
            let dr = abs(Int(a[i]) - Int(b[i]))
            let dg = abs(Int(a[i + 1]) - Int(b[i + 1]))
            let db = abs(Int(a[i + 2]) - Int(b[i + 2]))
            let pixelDiff = max(dr, dg, db)
            totalDiff += dr + dg + db
            if pixelDiff >= pixelThreshold {
                changed += 1
            }
        }
        let changedRatio = pixels == 0 ? 0 : Double(changed) / Double(pixels)
        let meanDiff = pixels == 0 ? 0 : Double(totalDiff) / Double(pixels * 3 * 255)
        return (changedRatio, meanDiff)
    }

    private func finishWatch() {
        if let lastFrame {
            saveImage(lastFrame, to: outputPath + ".last.png")
        }
        let payload: [String: Any] = [
            "type": "motion-watch",
            "cameraName": cameraName as Any,
            "frameCount": frameCount,
            "maxChangedRatio": maxChangedRatio,
            "maxMeanDiff": maxMeanDiff,
            "motionDetected": maxChangedRatio >= ratioThreshold,
            "thresholds": [
                "pixelThreshold": pixelThreshold,
                "ratioThreshold": ratioThreshold
            ],
            "artifacts": [
                "first": outputPath + ".first.png",
                "last": outputPath + ".last.png"
            ]
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
            FileManager.default.createFile(atPath: outputPath, contents: data)
        }
        finish(status: "ok")
    }

    private func saveImage(_ image: CGImage, to path: String) {
        let url = URL(fileURLWithPath: path)
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            return
        }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }

    private func finish(status: String) {
        session?.stopRunning()
        let payload: [String: Any] = [
            "status": status,
            "mode": mode,
            "cameraName": cameraName as Any,
            "output": outputPath
        ]
        if mode == "capture-frame", let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) {
            FileManager.default.createFile(atPath: outputPath + ".json", contents: data)
        }
        exit(status == "ok" ? 0 : 1)
    }
}

CameraEye().run()
