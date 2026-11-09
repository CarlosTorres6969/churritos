import QRCode from "qrcode"

// ESC/POS Commands for ISO A7 (74mm width)
export const ESCPOS_COMMANDS = {
  // Initialize printer
  INIT: "\x1B\x40",
  // Set character size (normal)
  CHAR_SIZE_NORMAL: "\x1D\x21\x00",
  // Set character size (small) - mejor para 58mm
  CHAR_SIZE_SMALL: "\x1D\x21\x01",
  // Set character size (compact) - optimizado para 58mm
  CHAR_SIZE_COMPACT: "\x1D\x21\x11",
  // Set line spacing
  LINE_SPACING_DEFAULT: "\x1B\x32",
  LINE_SPACING_TIGHT: "\x1B\x33\x10",
  // Text alignment
  ALIGN_LEFT: "\x1B\x61\x00",
  ALIGN_CENTER: "\x1B\x61\x01",
  ALIGN_RIGHT: "\x1B\x61\x02",
  // Text formatting
  BOLD_ON: "\x1B\x45\x01",
  BOLD_OFF: "\x1B\x45\x00",
  UNDERLINE_ON: "\x1B\x2D\x01",
  UNDERLINE_OFF: "\x1B\x2D\x00",
  // Paper cutting
  CUT_PAPER: "\x1D\x56\x00",
  CUT_PAPER_PARTIAL: "\x1D\x56\x01",
  // Feed paper
  FEED_LINE: "\x0A",
  FEED_LINES_3: "\x0A\x0A\x0A",
  FEED_LINES_5: "\x0A\x0A\x0A\x0A\x0A",
  // Drawer kick
  DRAWER_KICK: "\x1B\x70\x00\x19\xFA",
}

// Papel térmico 58mm - Configuración real
export const A7_CONFIG = {
  width: 58, // mm
  height: 200, // mm (largo variable)
  charactersPerLine: 32, // characters for 58mm at smaller font
  charactersPerLineSmall: 42, // characters for small font
  printableWidth: 54, // mm (accounting for margins)
  marginLeft: 2, // mm
  marginRight: 2, // mm
}

export interface POSPrintOptions {
  fontSize?: "normal" | "small" | "large" | "compact"
  alignment?: "left" | "center" | "right"
  bold?: boolean
  underline?: boolean
  cutPaper?: boolean
  feedLines?: number
  qrCode?: string
}

// Extend Navigator interface to include Web USB and Web Serial APIs
interface NavigatorWithWebAPIs extends Navigator {
  usb?: {
    requestDevice(options?: { filters: { vendorId: number }[] }): Promise<USBDevice>
    getDevices(): Promise<USBDevice[]>
  }
  serial?: {
    requestPort(options?: unknown): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }
}

interface USBDevice {
  open(): Promise<void>
  close(): Promise<void>
  transferOut(endpointNumber: number, data: BufferSource): Promise<void>
}

interface SerialPort {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  writable: WritableStream
}

export class POSPrinter {
  private device: USBDevice | null = null
  private printer: SerialPort | null = null

  // Initialize USB connection
  async initUSB(): Promise<boolean> {
    try {
      // Try to connect via USB
      if (typeof window !== "undefined" && "usb" in navigator) {
        const navigatorWithUSB = navigator as NavigatorWithWebAPIs;
        if (!navigatorWithUSB.usb) return false;
        
        const device = await navigatorWithUSB.usb.requestDevice({
          filters: [
            { vendorId: 0x04b8 }, // Epson
            { vendorId: 0x0519 }, // Star Micronics
            { vendorId: 0x154f }, // Citizen
            { vendorId: 0x0fe6 }, // ICS Advent
            { vendorId: 0x20d1 }, // Rongta
          ],
        })

        await device.open()
        this.device = device
        return true
      }
      return false
    } catch (error: unknown) {
      console.error("Error initializing USB printer:", error)
      return false
    }
  }

  // Initialize Serial/Bluetooth connection
  async initSerial(): Promise<boolean> {
    try {
      if (typeof window !== "undefined" && "serial" in navigator) {
        const navigatorWithSerial = navigator as NavigatorWithWebAPIs;
        if (!navigatorWithSerial.serial) return false;
        
        const port = await navigatorWithSerial.serial.requestPort()
        await port.open({ baudRate: 9600 })
        this.printer = port
        return true
      }
      return false
    } catch (error: unknown) {
      console.error("Error initializing serial printer:", error)
      return false
    }
  }

  // Send raw ESC/POS commands
  async sendRawCommand(command: string): Promise<boolean> {
    try {
      if (!this.device && !this.printer) return false

      const encoder = new TextEncoder()
      const data = encoder.encode(command)

      if (this.device?.transferOut) {
        // USB device
        await this.device.transferOut(1, data)
      } else if (this.printer?.writable) {
        // Serial device
        const writer = this.printer.writable.getWriter()
        await writer.write(data)
        writer.releaseLock()
      }

      return true
    } catch (error: unknown) {
      console.error("Error sending command:", error)
      return false
    }
  }

  // Format text for A7 paper
  formatTextForA7(text: string, options: POSPrintOptions = {}): string {
    const { fontSize = "normal", alignment = "left", bold = false, underline = false } = options

    const maxChars = fontSize === "small" || fontSize === "compact" ? A7_CONFIG.charactersPerLineSmall : A7_CONFIG.charactersPerLine

    let formatted = ""

    // Set character size
    if (fontSize === "compact") {
      formatted += ESCPOS_COMMANDS.CHAR_SIZE_COMPACT
    } else if (fontSize === "small") {
      formatted += ESCPOS_COMMANDS.CHAR_SIZE_SMALL
    } else {
      formatted += ESCPOS_COMMANDS.CHAR_SIZE_NORMAL
    }

    // Set alignment
    switch (alignment) {
      case "center":
        formatted += ESCPOS_COMMANDS.ALIGN_CENTER
        break
      case "right":
        formatted += ESCPOS_COMMANDS.ALIGN_RIGHT
        break
      default:
        formatted += ESCPOS_COMMANDS.ALIGN_LEFT
    }

    // Set formatting
    if (bold) formatted += ESCPOS_COMMANDS.BOLD_ON
    if (underline) formatted += ESCPOS_COMMANDS.UNDERLINE_ON

    // Format text to fit line width
    const lines = text.split("\n")
    const wrappedLines: string[] = []

    lines.forEach((line) => {
      if (line.length <= maxChars) {
        wrappedLines.push(line)
      } else {
        // Word wrap
        const words = line.split(" ")
        let currentLine = ""

        words.forEach((word) => {
          if ((currentLine + word).length <= maxChars) {
            currentLine += (currentLine ? " " : "") + word
          } else {
            if (currentLine) wrappedLines.push(currentLine)
            currentLine = word
          }
        })

        if (currentLine) wrappedLines.push(currentLine)
      }
    })

    formatted += wrappedLines.join("\n")

    // Reset formatting
    if (bold) formatted += ESCPOS_COMMANDS.BOLD_OFF
    if (underline) formatted += ESCPOS_COMMANDS.UNDERLINE_OFF
    formatted += ESCPOS_COMMANDS.ALIGN_LEFT

    return formatted
  }

  // Generate QR Code for receipt
  async generateQRCode(data: string): Promise<string> {
    try {
      const qrDataURL = await QRCode.toDataURL(data, {
        width: 100,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      })
      return qrDataURL
    } catch (error: unknown) {
      console.error("Error generating QR code:", error)
      return ""
    }
  }

  // Print receipt with ESC/POS commands
  async printReceipt(content: string, options: POSPrintOptions = {}): Promise<boolean> {
    try {
      let printData = ESCPOS_COMMANDS.INIT
      printData += ESCPOS_COMMANDS.LINE_SPACING_TIGHT

      // Format content
      printData += this.formatTextForA7(content, options)

      // Add QR code if specified
      if (options.qrCode) {
        printData += "\n\n"
        printData += ESCPOS_COMMANDS.ALIGN_CENTER
        // Note: QR code printing requires specific ESC/POS commands for each printer model
        printData += `QR: ${options.qrCode}\n`
        printData += ESCPOS_COMMANDS.ALIGN_LEFT
      }

      // Feed paper
      if (options.feedLines) {
        for (let i = 0; i < options.feedLines; i++) {
          printData += ESCPOS_COMMANDS.FEED_LINE
        }
      } else {
        printData += ESCPOS_COMMANDS.FEED_LINES_5
      }

      // Cut paper
      if (options.cutPaper !== false) {
        printData += ESCPOS_COMMANDS.CUT_PAPER
      }

      return await this.sendRawCommand(printData)
    } catch (error: unknown) {
      console.error("Error printing receipt:", error)
      return false
    }
  }

  // Check printer status
  async getStatus(): Promise<string> {
    try {
      if (!this.device && !this.printer) return "Desconectado"

      // Send status request command
      const statusCommand = "\x10\x04\x01" // DLE EOT n
      await this.sendRawCommand(statusCommand)

      // In a real implementation, you would read the response
      // For now, return connected status
      return "Conectado - Listo para imprimir"
    } catch (error: unknown) {
      console.error("Error checking status:", error)
      return "Error de comunicación"
    }
  }

  // Disconnect printer
  async disconnect(): Promise<void> {
    try {
      if (this.device) {
        if (this.device.close) {
          await this.device.close()
        }
        this.device = null
      }
      if (this.printer) {
        if (this.printer.close) {
          await this.printer.close()
        }
        this.printer = null
      }
    } catch (error: unknown) {
      console.error("Error disconnecting:", error)
    }
  }
}

// Utility functions for different printer brands
export const PrinterUtils = {
  // Epson specific commands
  epson: {
    setA7PaperSize: "\x1B\x28\x43\x02\x00\x4A\x69", // Set paper size to A7
    setDensity: "\x1D\x7C\x00", // Set print density
  },

  // Star Micronics specific commands
  star: {
    setA7PaperSize: "\x1B\x1D\x50\x4A\x69",
    setCompression: "\x1B\x1D\x2A\x01",
  },

  // Citizen specific commands
  citizen: {
    setA7PaperSize: "\x1B\x43\x4A\x69",
    setSpeed: "\x1B\x73\x01",
  },
}

// Export singleton instance
export const posprinter = new POSPrinter()