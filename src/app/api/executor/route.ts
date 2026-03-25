import { NextResponse } from 'next/server'

// all the CORS stuff so localhost can access the server
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400', // 24 hours
};

const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY ?? '';

// the JUICE, the main stuff ahahaha
interface Submission {
    submission: string;
    language: "javascript" | "python" | "java" | "c++";
}

const submissions: string[] = [];

interface Judge0SubmitResponse {
    token: string;
}

interface Judge0Result {
    stdout: string | null;
    stderr: string | null;
    compile_output: string | null;
    status: { id: number; description: string };
}

// Judge0 CE language IDs
const languageMap: Record<Submission['language'], number> = {
    'javascript': 63,
    'python': 71,
    'java': 62,
    'c++': 54,
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET() {
    return NextResponse.json(submissions, { headers: corsHeaders })
}

export async function POST(request: Request) {
    const code = await request.json() as Submission;

    // Language-specific test cases
    const testCases = {
        javascript: `
            class ListNode {
                constructor(val = 0, next = null) {
                    this.val = val;
                    this.next = next;
                }
            }
            function executeTest() {
                const l1 = new ListNode(0);
                const l2 = new ListNode(0);
                const result = addTwoNumbers(l1, l2);
                const output = [];
                let current = result;
                while (current) {
                    output.push(current.val);
                    current = current.next;
                }
                console.log(JSON.stringify(output));
            }
            executeTest();`,
        python: `
def execute_test():
    l1 = ListNode(0)
    l2 = ListNode(0)
    result = addTwoNumbers(l1, l2)
    output = []
    current = result
    while current:
        output.append(current.val)
        current = current.next
    print(output)

execute_test()`,
        java: `
    public static void main(String[] args) {
        ListNode l1 = new ListNode(0);
        ListNode l2 = new ListNode(0);
        ListNode result = addTwoNumbers(l1, l2);
        java.util.List<Integer> output = new java.util.ArrayList<>();
        while (result != null) {
            output.add(result.val);
            result = result.next;
        }
        System.out.println(output.toString());
    }`,
        "c++": `
int main() {
    ListNode* l1 = new ListNode(0);
    ListNode* l2 = new ListNode(0);
    ListNode* result = addTwoNumbers(l1, l2);
    vector<int> output;
    while (result) {
        output.push_back(result->val);
        result = result->next;
    }
    cout << "[";
    for (size_t i = 0; i < output.size(); ++i) {
        if (i > 0) cout << ",";
        cout << output[i];
    }
    cout << "]" << endl;
    return 0;
}`
    };

    // Language-specific wrappers
    const wrappers = {
        javascript: (c: string) => `${c}\n${testCases.javascript}`,
        python: (c: string) => `${c}\n${testCases.python}`,
        java: (c: string) => `
public class Main {
    ${c}
    ${testCases.java}
}`,
        "c++": (c: string) => `
#include <iostream>
#include <vector>
using namespace std;
${c}
${testCases["c++"]}`,
    };

    const judgeHeaders = {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': JUDGE0_API_KEY,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
    };

    try {
        const wrappedCode = wrappers[code.language](code.submission);

        // Step 1: Submit
        const submitRes = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=false`, {
            method: 'POST',
            headers: judgeHeaders,
            body: JSON.stringify({
                source_code: wrappedCode,
                language_id: languageMap[code.language],
            }),
        });

        const { token } = await submitRes.json() as Judge0SubmitResponse;

        // Step 2: Poll until done (status id >= 3 means finished)
        let result: Judge0Result | null = null;
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pollRes = await fetch(`${JUDGE0_URL}/submissions/${token}?base64_encoded=false`, {
                headers: judgeHeaders,
            });
            result = await pollRes.json() as Judge0Result;
            if (result.status.id >= 3) break;
        }

        if (!result) throw new Error('Execution timed out');

        // Compile error or runtime error
        const errorOutput = result.compile_output ?? result.stderr;
        if (result.status.id !== 3 && errorOutput) {
            throw new Error(errorOutput.trim());
        }

        const output = (result.stdout ?? '').trim();
        submissions.push(output);

        return NextResponse.json({
            success: true,
            results: output,
        }, { headers: corsHeaders });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Execution failed',
        }, { headers: corsHeaders });
    }
}