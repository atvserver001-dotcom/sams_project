package com.hub900.a;

import java.util.*;

public class a
{
    private static final byte c = Byte.MAX_VALUE;
    private static final byte d = 126;
    
    public static byte[] a(final byte[] bb) {
        final List<Byte> byteList = new ArrayList<Byte>();
        boolean bol = false;
        for (int i = 0; i < bb.length; ++i) {
            if (bol) {
                bol = false;
            }
            else if (bb[i] == 125) {
                switch (bb[i + 1]) {
                    case 1: {
                        byteList.add((Byte)125);
                        break;
                    }
                    case 2: {
                        byteList.add((Byte)126);
                        break;
                    }
                    case 3: {
                        byteList.add((Byte)127);
                        break;
                    }
                }
                bol = true;
            }
            else {
                byteList.add(bb[i]);
            }
        }
        final byte[] resulst = new byte[byteList.size()];
        for (int i2 = 0; i2 < byteList.size(); ++i2) {
            resulst[i2] = byteList.get(i2);
        }
        return resulst;
    }
    
    public static int b(final byte... bytes) {
        switch (bytes.length) {
            case 1: {
                return bytes[0] & 0xFF;
            }
            case 2: {
                return ((bytes[0] & 0xFF) << 8) + (bytes[1] & 0xFF);
            }
            case 3: {
                return ((bytes[0] & 0xFF) << 16) + ((bytes[1] & 0xFF) << 8) + (bytes[2] & 0xFF);
            }
            case 4: {
                return ((bytes[0] & 0xFF) << 24) + ((bytes[1] & 0xFF) << 16) + ((bytes[2] & 0xFF) << 8) + (bytes[3] & 0xFF);
            }
            default: {
                return 0;
            }
        }
    }
    
    public static boolean c(final byte[] content) {
        for (int i = 0; i < content.length; ++i) {
            if (content[i] == 125 && content[i + 1] != 1 && content[i + 1] != 2 && content[i + 1] != 3) {
                return false;
            }
        }
        return true;
    }
    
    public static byte[] d(final byte[] bytes) {
        final byte[] newBytes = new byte[bytes.length - 2];
        System.arraycopy(bytes, 1, newBytes, 0, newBytes.length);
        return newBytes;
    }
    
    public static String e(final byte[] bytes) {
        final StringBuffer strByte = new StringBuffer();
        for (final byte b : bytes) {
            final String bb = Integer.toHexString(b & 0xFF);
            char c = '\uffff';
            switch (bb.hashCode()) {
                case 48: {
                    if (bb.equals("0")) {
                        c = '\0';
                        break;
                    }
                    break;
                }
                case 49: {
                    if (bb.equals("1")) {
                        c = '\u0001';
                        break;
                    }
                    break;
                }
                case 50: {
                    if (bb.equals("2")) {
                        c = '\u0002';
                        break;
                    }
                    break;
                }
                case 51: {
                    if (bb.equals("3")) {
                        c = '\u0003';
                        break;
                    }
                    break;
                }
                case 52: {
                    if (bb.equals("4")) {
                        c = '\u0004';
                        break;
                    }
                    break;
                }
                case 53: {
                    if (bb.equals("5")) {
                        c = '\u0005';
                        break;
                    }
                    break;
                }
                case 54: {
                    if (bb.equals("6")) {
                        c = '\u0006';
                        break;
                    }
                    break;
                }
                case 55: {
                    if (bb.equals("7")) {
                        c = '\u0007';
                        break;
                    }
                    break;
                }
                case 56: {
                    if (bb.equals("8")) {
                        c = '\b';
                        break;
                    }
                    break;
                }
                case 57: {
                    if (bb.equals("9")) {
                        c = '\t';
                        break;
                    }
                    break;
                }
                case 97: {
                    if (bb.equals("a")) {
                        c = '\n';
                        break;
                    }
                    break;
                }
                case 98: {
                    if (bb.equals("b")) {
                        c = '\u000b';
                        break;
                    }
                    break;
                }
                case 99: {
                    if (bb.equals("c")) {
                        c = '\f';
                        break;
                    }
                    break;
                }
                case 100: {
                    if (bb.equals("d")) {
                        c = '\r';
                        break;
                    }
                    break;
                }
                case 101: {
                    if (bb.equals("e")) {
                        c = '\u000e';
                        break;
                    }
                    break;
                }
                case 102: {
                    if (bb.equals("f")) {
                        c = '\u000f';
                        break;
                    }
                    break;
                }
            }
            switch (c) {
                case '\0':
                case '\u0001':
                case '\u0002':
                case '\u0003':
                case '\u0004':
                case '\u0005':
                case '\u0006':
                case '\u0007':
                case '\b':
                case '\t':
                case '\n':
                case '\u000b':
                case '\f':
                case '\r':
                case '\u000e':
                case '\u000f': {
                    strByte.append("0").append(bb);
                    break;
                }
                default: {
                    strByte.append(bb);
                    break;
                }
            }
        }
        return strByte.toString();
    }
    
    public static String f(final byte[] src) {
        return a(src, "ASCII");
    }
    
    public static String a(final byte[] src, final String charsetName) {
        try {
            return new String(src, charsetName);
        }
        catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }
    
    public static boolean a(final int targetBitIndex, final byte src) {
        int rightTargetBitIndex;
        if (targetBitIndex < 0 || targetBitIndex > 7) {
            rightTargetBitIndex = 0;
        }
        else {
            rightTargetBitIndex = targetBitIndex;
        }
        return (1 << rightTargetBitIndex & 0xFF & src) != 0x0;
    }
}
