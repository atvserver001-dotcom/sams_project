package com.hub900.a;

import java.nio.charset.*;

public class b
{
    private static final char[] e;
    private static final char[] f;
    
    public static char[] g(final byte[] data) {
        return a(data, true);
    }
    
    public static char[] a(final byte[] data, final boolean toLowerCase) {
        return a(data, toLowerCase ? b.e : b.f);
    }
    
    protected static char[] a(final byte[] data, final char[] toDigits) {
        if (data == null) {
            return new char[0];
        }
        final int l = data.length;
        final char[] out = new char[l << 1];
        int i = 0;
        int j = 0;
        while (i < l) {
            out[j++] = toDigits[(0xF0 & data[i]) >>> 4];
            out[j++] = toDigits[0xF & data[i]];
            ++i;
        }
        return out;
    }
    
    public static String h(final byte[] data) {
        return b(data, true);
    }
    
    public static String b(final byte[] data, final boolean toLowerCase) {
        return b(data, toLowerCase ? b.e : b.f);
    }
    
    protected static String b(final byte[] data, final char[] toDigits) {
        return new String(a(data, toDigits));
    }
    
    public static byte[] a(final char[] data) {
        final int len = data.length;
        if ((len & 0x1) != 0x0) {
            throw new RuntimeException("Odd number of characters.");
        }
        final byte[] out = new byte[len >> 1];
        int f;
        for (int i = 0, j = 0; j < len; ++j, f |= a(data[j], j), ++j, out[i] = (byte)(f & 0xFF), ++i) {
            f = a(data[j], j) << 4;
        }
        return out;
    }
    
    public static int a(final char ch, final int index) {
        final int digit = Character.digit(ch, 16);
        if (digit == -1) {
            throw new RuntimeException("Illegal hexadecimal character " + ch + " at index " + index);
        }
        return digit;
    }
    
    public static byte[] a(String hexString) {
        if (hexString == null || hexString.equals("")) {
            return new byte[0];
        }
        hexString = hexString.toUpperCase();
        final int length = hexString.length() / 2;
        final char[] hexChars = hexString.toCharArray();
        final byte[] d = new byte[length];
        for (int i = 0; i < length; ++i) {
            final int pos = i * 2;
            d[i] = (byte)(a(hexChars[pos]) << 4 | a(hexChars[pos + 1]));
        }
        return d;
    }
    
    public static byte[] b(final String hexString) {
        if (null == hexString || "".equals(hexString.trim())) {
            return new byte[0];
        }
        final byte[] bytes = new byte[hexString.length() / 2];
        for (int i = 0; i < hexString.length() / 2; ++i) {
            final String hex = hexString.substring(i * 2, i * 2 + 2);
            bytes[i] = (byte)Integer.parseInt(hex, 16);
        }
        return bytes;
    }
    
    public static byte a(final char c) {
        return (byte)"0123456789ABCDEF".indexOf(c);
    }
    
    public static String i(final byte[] data) {
        final StringBuilder sb = new StringBuilder();
        for (final byte datum : data) {
            final char temp = (char)datum;
            if (temp != '\0') {
                sb.append(temp);
            }
        }
        return sb.toString();
    }
    
    public static String j(final byte[] data) {
        final StringBuilder sb = new StringBuilder();
        for (int i = 0; i < data.length; ++i) {
            final byte datum = data[i];
            final String hex = Integer.toHexString(datum & 0xFF);
            if (hex.length() < 2) {
                sb.append(0);
            }
            if (datum == 44) {
                final char ch = (char)datum;
                sb.append(ch);
            }
            else {
                sb.append(hex);
            }
        }
        return sb.toString();
    }
    
    public static String a(final byte[] data, final int offset, final int length) {
        return new String(data, offset, length, Charset.forName("US-ASCII"));
    }
    
    public static String k(final byte[] data) {
        return a(data, 0, data.length);
    }
    
    public static byte[] c(final String data) {
        final byte[] array = new byte[data.length()];
        for (int i = 0; i < data.length(); ++i) {
            array[i] = (byte)data.charAt(i);
        }
        return array;
    }
    
    public static String l(final byte[] bytes) {
        final StringBuffer sb = new StringBuffer();
        for (int i = 0; i < bytes.length; ++i) {
            final String hex = Integer.toHexString(bytes[i] & 0xFF);
            if (hex.length() < 2) {
                sb.append(0);
            }
            sb.append(hex);
        }
        return sb.toString();
    }
    
    public static String d(final String hex) {
        final StringBuilder sb = new StringBuilder();
        final StringBuilder temp = new StringBuilder();
        for (int i = 0; i < hex.length() - 1; i += 2) {
            final String output = hex.substring(i, i + 2);
            final int str = Integer.parseInt(output, 16);
            sb.append((char)str);
            temp.append(str);
        }
        return sb.toString();
    }
    
    public static byte[] a(final int... bytes) {
        final byte[] dest = new byte[bytes.length];
        for (int i = 0; i < bytes.length; ++i) {
            dest[i] = (byte)(bytes[i] & 0xFF);
        }
        return dest;
    }
    
    public static byte[] m(final byte... bytes) {
        final byte[] dest = new byte[bytes.length];
        System.arraycopy(bytes, 0, dest, 0, bytes.length);
        return dest;
    }
    
    public static byte[] a(final byte[] source, final int length) {
        final byte[] dest = new byte[length];
        System.arraycopy(source, 0, dest, 0, dest.length);
        return dest;
    }
    
    public static byte[] b(final byte[] source, final int start, final int end) {
        final byte[] dest = new byte[end - start];
        System.arraycopy(source, start, dest, 0, dest.length);
        return dest;
    }
    
    public static byte[] c(final byte[] source, final int start, final int length) {
        final byte[] dest = new byte[length];
        System.arraycopy(source, start, dest, 0, dest.length);
        return dest;
    }
    
    public static int[] a(final int source, final int[] dest) {
        final int[] result = new int[1 + dest.length];
        result[0] = source;
        System.arraycopy(dest, 0, result, 1, dest.length);
        return result;
    }
    
    public static byte[] a(final byte source, final byte[] dest) {
        final byte[] temp = { source };
        return a(temp, dest);
    }
    
    public static byte[] a(final byte[] source, final byte dest) {
        final byte[] result = new byte[source.length + 1];
        final byte[] temp = { dest };
        System.arraycopy(source, 0, result, 0, source.length);
        System.arraycopy(temp, 0, result, result.length - 1, 1);
        return result;
    }
    
    public static byte[] a(final byte[] source, final byte[] dest) {
        final byte[] result = new byte[source.length + dest.length];
        System.arraycopy(source, 0, result, 0, source.length);
        final int offset = result.length - dest.length;
        System.arraycopy(dest, 0, result, offset, dest.length);
        return result;
    }
    
    public static byte[] a(final byte[]... bytes) {
        byte[] dest = new byte[0];
        for (final byte[] outs : bytes) {
            dest = a(dest, outs);
        }
        return dest;
    }
    
    public static long d(final byte[] bytes, final int pos, int len) {
        long val = 0L;
        len += pos;
        for (int i = pos; i < len; ++i) {
            val <<= 8;
            val |= ((long)bytes[i] & 0xFFL);
        }
        return val;
    }
    
    public static int e(final byte[] bytes, final int pos, int len) {
        int val = 0;
        len += pos;
        for (int i = pos; i < len; ++i) {
            val <<= 8;
            val |= (bytes[i] & 0xFF);
        }
        return val;
    }
    
    public static byte[] n(final byte[] bytes) {
        final byte[] dest = new byte[bytes.length];
        for (int index = bytes.length - 1, i = 0; i <= index; ++i) {
            dest[i] = bytes[index - i];
        }
        return dest;
    }
    
    public static int a(final byte value) {
        return value & 0xFF;
    }
    
    public static String b(final byte msg) {
        final String str = Integer.toHexString(0xFF & msg);
        return ((str.length() < 2) ? ("0" + str) : str).toUpperCase();
    }
    
    public static String e(final String msg) {
        final byte[] bytes = a(msg);
        String str = "";
        for (int length = bytes.length, i = 0; i < length; ++i) {
            if ("7D".equals(b(bytes[i]))) {
                str += "7D01";
            }
            else if ("7E".equals(b(bytes[i]))) {
                str += "7D02";
            }
            else if ("7F".equals(b(bytes[i]))) {
                str += "7D03";
            }
            else {
                str += b(bytes[i]);
            }
        }
        return str;
    }
    
    public static int o(final byte... bytes) {
        if (bytes.length == 1) {
            return bytes[0] & 0xFF;
        }
        if (bytes.length == 2) {
            return ((bytes[0] & 0xFF) << 8) + (bytes[1] & 0xFF);
        }
        if (bytes.length == 3) {
            return ((bytes[0] & 0xFF) << 16) + ((bytes[1] & 0xFF) << 8) + (bytes[2] & 0xFF);
        }
        if (bytes.length == 4) {
            return ((bytes[0] & 0xFF) << 24) + ((bytes[1] & 0xFF) << 16) + ((bytes[2] & 0xFF) << 8) + (bytes[3] & 0xFF);
        }
        return 0;
    }
    
    static {
        e = new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' };
        f = new char[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F' };
    }
}
