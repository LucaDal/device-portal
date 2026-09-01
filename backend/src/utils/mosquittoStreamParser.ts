export const MOSQUITTO_STREAM_FORMAT = "%t\\0%l\\0%p";

const FIELD_SEPARATOR = 0;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export type MosquittoStreamRecord = {
    topic: string;
    payload: string;
};

export class MosquittoStreamParser {
    private buffer = Buffer.alloc(0);

    reset() {
        this.buffer = Buffer.alloc(0);
    }

    push(chunk: Buffer): MosquittoStreamRecord[] {
        this.buffer = this.buffer.length
            ? Buffer.concat([this.buffer, chunk])
            : Buffer.from(chunk);

        if (this.buffer.length > MAX_BUFFER_BYTES) {
            this.reset();
            throw new Error("MQTT subscriber output exceeded the buffer limit");
        }

        const records: MosquittoStreamRecord[] = [];
        while (this.buffer.length > 0) {
            const topicEnd = this.buffer.indexOf(FIELD_SEPARATOR);
            if (topicEnd === -1) break;

            const lengthEnd = this.buffer.indexOf(FIELD_SEPARATOR, topicEnd + 1);
            if (lengthEnd === -1) break;

            const topic = this.buffer.subarray(0, topicEnd).toString("utf8");
            const lengthText = this.buffer
                .subarray(topicEnd + 1, lengthEnd)
                .toString("ascii");
            if (!topic || !/^\d+$/.test(lengthText)) {
                this.reset();
                throw new Error("MQTT subscriber returned an invalid framed message");
            }

            const payloadLength = Number(lengthText);
            if (!Number.isSafeInteger(payloadLength) || payloadLength > MAX_BUFFER_BYTES) {
                this.reset();
                throw new Error("MQTT subscriber returned an invalid payload length");
            }

            const payloadStart = lengthEnd + 1;
            const payloadEnd = payloadStart + payloadLength;
            if (this.buffer.length < payloadEnd) break;

            records.push({
                topic,
                payload: this.buffer.subarray(payloadStart, payloadEnd).toString("utf8"),
            });
            this.buffer = this.buffer.subarray(payloadEnd);
        }

        return records;
    }
}
